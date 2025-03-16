import json
import os
import pathlib
import sys
from datetime import timedelta, datetime
import traceback

import db
import config
from typing_extensions import Type
from auto_analyze import process_candidate
from common import get_session_id_from_response
from reqresp import IRequestResponse
import prefilter
import identical
import matching_heuristic


DATA_PATH: str


def is_subject_task_live(task_model: Type[db.Task], subject_id):
    """Check if the task is in live mode."""

    latest_task_of_subject = (
        task_model.select()
        .where(task_model.subject_id == subject_id)
        .order_by(task_model.created_at.desc())
        .first()
    )

    return (
        latest_task_of_subject is not None
        and latest_task_of_subject.status_name == "processing"
    )


def model_to_dict(model, recurse=True):
    """Convert a peewee model to a dictionary."""
    data = model.__dict__["__data__"].copy()
    if recurse:
        for key, value in data.items():
            if isinstance(value, db.Model):
                data[key] = model_to_dict(value)
    return data


def complete_task(task: db.Task, task_status: str):
    task.status_name = task_status
    task.save()


def preanalysis(task: db.PreanalysisTask):

    task_status = "completed"

    subject = db.Subject.get_or_none(id=task.subject_id)

    if subject is None:

        task.result_name = "pae"
        task.note = "subject not found"
        task.save()
        task_status = "completed"
        return task_status

    if task.is_live:
        # we need to wait until there is a multiple of two reports are available
        while subject.reports.count() % 2 != 0:
            pass

    # take the latest two reports
    reportA, reportB = subject.reports.order_by(db.UserdiffReport.created_at.desc()).limit(2)

    def fixed_responses_batches_iterator():

        responsesA = [
            IRequestResponse(response)
            for response in reportA.responses.select().where(
                db.UserdiffResponse.resource_type.in_(config.ALLOWED_CONTENT_TYPES)
            )
        ]

        responsesB = [
            IRequestResponse(response)
            for response in reportB.responses.select().where(
                db.UserdiffResponse.resource_type.in_(config.ALLOWED_CONTENT_TYPES)
            )
        ]

        yield responsesA, responsesB

    def live_responses_batches_iterator():

        timestamp_start = reportA.created_at
        duration_dist_from_now = timedelta(
            seconds=config.LIVE_REQUEST_FETCH_DURATION_DIST_FROM_NOW_SECONDS
        )

        while is_subject_task_live(db.VisitTask, subject.id):

            # if timestamp_start is None:
            #     timestamp_start = reportA.created_at

            timestamp_stop = datetime.now() - duration_dist_from_now

            responsesA = [
                IRequestResponse(response)
                for response in reportA.responses.select().where(
                    db.UserdiffResponse.created_at >= timestamp_start,
                    db.UserdiffResponse.created_at <= timestamp_stop,
                    db.UserdiffResponse.resource_type.in_(config.ALLOWED_CONTENT_TYPES),
                )
            ]

            responsesB = [
                IRequestResponse(response)
                for response in reportB.responses.select().where(
                    db.UserdiffResponse.created_at >= timestamp_start,
                    db.UserdiffResponse.created_at <= timestamp_stop,
                    db.UserdiffResponse.resource_type.in_(config.ALLOWED_CONTENT_TYPES),
                )
            ]

            timestamp_start = timestamp_stop

            # wait for a while
            while (
                datetime.now() - timestamp_stop - duration_dist_from_now
                < config.BATCH_PREANALYSIS_WAIT
            ):
                pass

            yield responsesA, responsesB

        # one last time
        responsesA = [
            IRequestResponse(response)
            for response in reportA.responses.select().where(
                db.UserdiffResponse.created_at >= timestamp_start,
                db.UserdiffResponse.resource_type.in_(config.ALLOWED_CONTENT_TYPES),
            )
        ]

        responsesB = [
            IRequestResponse(response)
            for response in reportB.responses.select().where(
                db.UserdiffResponse.created_at >= timestamp_start,
                db.UserdiffResponse.resource_type.in_(config.ALLOWED_CONTENT_TYPES),
            )
        ]
        
        yield responsesA, responsesB

    responses_batches_iterator = (
        fixed_responses_batches_iterator
        if not task.is_live
        else live_responses_batches_iterator
    )

    report_dir = pathlib.Path(DATA_PATH) / f"{subject.id}/{task.id}"

    analysis_task = (
        db.AnalysisTask.select()
        .where(
            db.AnalysisTask.subject_id == subject.id,
            db.AnalysisTask.status_name.in_(
                ["preparing"] if not task.is_live else ["free", "processing"]
            ),
        )
        .first()
    )

    if analysis_task is None:

        # create a new analysis task
        analysis_task = db.AnalysisTask.create(
            subject_id=subject.id,
            status_name=("preparing" if not task.is_live else "free"),
            task_type="auto",
            is_live=task.is_live,
        )
        
    os.makedirs(report_dir, exist_ok=True)
    
    for responsesA, responsesB in responses_batches_iterator():

        if not task.is_live and (len(responsesA) == 0 or len(responsesB) == 0):
            task.result_name = "pae"
            task.note = "no responses found"
            task.save()
            task_status = "completed"
            return task_status

        responsesA, _ = prefilter.prefilter(
            responsesA, subject.start_url, reportA.report_id, report_dir
        )
        responsesB, _ = prefilter.prefilter(
            responsesB, subject.start_url, reportB.report_id, report_dir
        )

        (responsesA, responsesB), _ = identical.remove_identical_responses(
            responsesA, responsesB, report_dir
        )

        matches, _ = matching_heuristic.match_requests(
            responsesA, responsesB, report_dir=report_dir
        )

        try:

            with db.db.atomic():

                for match in matches:

                    # print(f"Creating analysis candidate pair for {match[0].response.response_id} and {match[1].response.response_id}")
                    db.AnalysisCandidatePair.create(
                        task_id=analysis_task.id,
                        response_1_id=match[0].response.response_id,
                        response_2_id=match[1].response.response_id,
                        additional_information=json.dumps(
                            {"path_distance": match[2], "query_distance": match[3]}
                        ),
                    )

        except Exception as e:

            db.AnalysisTask.delete().where(
                db.AnalysisTask.id == analysis_task.id
            ).execute()

            raise e

    analysis_task = (
        db.AnalysisTask.select()
        .where(
            db.AnalysisTask.subject_id == subject.id,
            db.AnalysisTask.status_name.in_(["preparing", "free", "processing"]),
        )
        .first()
    )

    if analysis_task is None:
        task.result_name = "pae"
        task.note = "analysis task not created"
        task.save()
        task_status = "completed"
        return task_status

    # check if we need to dispose it because something happened with the visit task
    preanalysis_task = db.PreanalysisTask.get_or_none(id=task.id)

    if preanalysis_task.note and "dispose" in preanalysis_task.note:

        # prep the analysis task for disposal
        analysis_task.note = json.dumps({"todo": "dispose"})
        analysis_task.save()

        # update the task status
        task.result_name = "pae"
        task.note = "disposed"
        task.save()
        task_status = "completed"
        return task_status

    if not task.is_live:
        analysis_task.status_name = "free"
        analysis_task.save()

    task.result_name = "pas"
    task.save()

    return task_status


def process_analysis_candidate(
    candidate: db.AnalysisCandidatePair, swap_task: db.SwapTask
):

    try:
        variables, swappable_keys, request, variable_configurations, try_manual = (
            process_candidate(candidate)
        )

    except Exception as e:
        print(f"Automated analysis error for candidate {candidate.id}.")
        print(e)
        print(traceback.format_exc())
        candidate.result_name = "cpe"
        candidate.save()
        return
    
    candidate.swappable_keys = swappable_keys

    if try_manual:

        print(
            f"Automated analysis failed for candidate {candidate.id}. Scheduling manual analysis."
        )

        # get or create manual analysis task
        manual_task = (
            db.AnalysisTask.select()
            .where(
                db.AnalysisTask.subject_id == candidate.task.subject_id,
                db.AnalysisTask.task_type == "manual",
            )
            .first()
        )

        if manual_task is None:

            manual_task = db.AnalysisTask.create(
                subject_id=candidate.task.subject_id,
                status_name="preparing",
                task_type="manual",
            )

        db.AnalysisCandidatePair.create(
            task_id=manual_task.id,
            response_1_id=candidate.response_1_id,
            response_2_id=candidate.response_2_id,
            additional_information=candidate.additional_information,
            swappable_keys=swappable_keys,
        )

        candidate.result_name = "cpn"
        candidate.save()

        return
    
    if not request:
        candidate.result_name = "cpn"
        candidate.save()
        return
    
    request_hash = request.hash()
    
    # check if the swap candidate hash already exists
    if db.SwapCandidatePair.select().where(
        db.SwapCandidatePair.representation_hash == request_hash,
        db.SwapCandidatePair.task_id == swap_task.id
    ).exists():
        print(f"Skipping candidate {candidate.id} as it already exists")
        candidate.result_name = "cpi"
        candidate.save()
        return

    # check if no variables found or all variables have only one value
    if not variables or len(variable_configurations) == 0:

        candidate.result_name = "cpi"
        candidate.save()

        print(f"Skipping candidate {candidate.id} as no variables found")
        return

    for variable_configuration in variable_configurations:
        db.SwapCandidatePair.create(
            task_id=swap_task.id,
            candidate_pair_id=candidate.id,
            swap_request_representation=request.to_dict(),
            representation_hash=request_hash,
            interest_variables=variable_configuration,
        )

    candidate.result_name = "cpv"
    candidate.save()


def analysis(task: db.AnalysisTask):

    task.actor = "auto"
    task.save()

    def fixed_candidate_iterator():

        for candidate in task.candidate_pairs:
            yield candidate

    def live_candidate_iterator():

        while is_subject_task_live(db.PreanalysisTask, task.subject_id):

            t_iter = datetime.now()

            candidates = db.AnalysisCandidatePair.select().where(
                db.AnalysisCandidatePair.task_id == task.id,
                db.AnalysisCandidatePair.result_name.is_null(),
            )

            for candidate in candidates:
                yield candidate

            # wait for a while
            while datetime.now() - t_iter < config.BATCH_ANALYSIS_WAIT:
                pass

        # one last time
        candidates = db.AnalysisCandidatePair.select().where(
            db.AnalysisCandidatePair.task_id == task.id,
            db.AnalysisCandidatePair.result_name.is_null(),
        )

        for candidate in candidates:
            yield candidate

    candidate_iterator = (
        live_candidate_iterator if task.is_live else fixed_candidate_iterator
    )()

    #  get or create the swap task
    swap_task = (
        db.SwapTask.select()
        .where(
            db.SwapTask.subject_id == task.subject_id,
            db.SwapTask.actor == "auto",
            db.SwapTask.status_name == ("preparing" if not task.is_live else "free"),
            db.SwapTask.is_live == task.is_live,
        )
        .first()
    )

    first_candidate = next(candidate_iterator, None)
    
    if first_candidate is None:
        task.result_name = "ae"
        task.note = "no candidates found"
        task.save()
        return "completed"

    if not swap_task:

        session_1 = get_session_id_from_response(first_candidate.response_1)

        swap_task = db.SwapTask.create(
            subject_id=task.subject_id,
            actor="auto",
            status_name="preparing" if not task.is_live else "free",
            task_type="auto",
            session_id=session_1,
            is_live=task.is_live,
        )

    if first_candidate is not None:
        process_analysis_candidate(first_candidate, swap_task)

    for candidate in candidate_iterator:
        process_analysis_candidate(candidate, swap_task)

    # check if we need to dispose it because something happened with the preanalysis task
    analysis_task = db.AnalysisTask.get_or_none(id=task.id)

    if analysis_task.note and "dispose" in analysis_task.note:

        # prep the swap task for disposal
        swap_task.note = json.dumps({"todo": "dispose"})
        swap_task.save()
        
        # remove all analysis candidate pairs
        db.AnalysisCandidatePair.delete().where(
            db.AnalysisCandidatePair.task_id == task.id
        ).execute()

        # update the task status
        task.result_name = "ac"
        task.note = "disposed"
        task.save()
        return "completed"
    
    if not task.is_live:
        swap_task.status_name = "free"
        swap_task.save()

    task.status_name = "completed"
    task.result_name = "as"
    task.save()

    return "completed"


str_to_th = {
    "preanalysis": (db.PreanalysisTask, preanalysis),
    "analysis": (db.AnalysisTask, analysis),
}


def main(task_id: str, task_type: str) -> int:
    """Process a task."""
    table, handler = str_to_th[task_type]
    task: db.Task = table.get_or_none(id=task_id)
    if task is None:
        print(f"{datetime.now()}: Cannot claim task {task_id}, {task_type}")
        return 0
    task.status_name = "processing"
    task.save()
    print(
        f"{datetime.now()}: Starting task: {table}: {model_to_dict(task, recurse=False)}"
    )
    task_status = handler(task)
    complete_task(task, task_status)
    print(f"{datetime.now()}: Completed task: {task_status}")

    return 0


if __name__ == "__main__":
    # sys.path = [
    #     str((pathlib.Path(__file__)).resolve())
    # ] + sys.path

    DATA_PATH = sys.argv[3]

    sys.exit(main(sys.argv[1], sys.argv[2]))
