import argparse
from collections import defaultdict
import json
import os
from pathlib import Path
import re
import subprocess
from typing import Optional
import db
import bullet
import click
import urllib.parse

from framework.analysis.common import get_session_id_from_response
from swap_candidate import RequestInstance, SwapRequest
from matching_heuristic import sanitize_url
from utils import PatternList
from reqresp import headers_to_dict, split_url_into_path_and_query


HEADERS_IGNORED = PatternList.from_file(
    Path(__file__).parent / "resources/headerignore.txt"
)
COOKIES_IGNORED = PatternList.from_file(
    Path(__file__).parent / "resources/cookieignore.txt"
)


def clear_screen():
    print("\033c")


def choice_list(question, choices):
    """Pretty print a choice list."""
    cli = bullet.Bullet(
        prompt=f"\n{question}",
        choices=choices,
        indent=0,
        align=5,
        margin=2,
        bullet="\u261E",
        bullet_color=bullet.colors.bright(bullet.colors.foreground["green"]),
        word_color=bullet.colors.bright(bullet.colors.foreground["black"]),
        word_on_switch=bullet.colors.bright(bullet.colors.foreground["green"]),
        background_color=bullet.colors.background["white"],
        background_on_switch=bullet.colors.background["white"],
        pad_right=5,
    )

    return cli.launch()


def multi_choice_list(question, choices):

    cli = bullet.Check(prompt=f"\n{question}", choices=choices)

    return cli.launch()


def multiline_input(question, text=""):
    # use click
    full = question + " (do not edit this line)\n" + text
    resp = click.edit(text=full, require_save=True, editor="vim")
    return resp.split("\n", 1)[1]


def update_task_status(task: db.AnalysisTask, status: str):
    task.status_name = status
    task.save()


def get_tasks_to_process():

    tasks = db.AnalysisTask.select().where(
        db.AnalysisTask.status_name == "free",
    )

    if tasks is None:
        return None

    # update the task as "selected"
    # update_task_status(task, "selected")

    return tasks


def tasks_to_choices(tasks):
    return [
        f"[{task.id}] {task.subject.start_url} | {task.candidate_pairs.count()} candidates"
        for task in tasks
    ]


def free_task(task: db.AnalysisTask):
    update_task_status(task, "free")


def format_headers(headers):

    _headers = []

    for key, value in headers.items():

        if HEADERS_IGNORED.matches(key):
            continue

        _headers.append(f"{key}: {value}")

    _headers = sorted(_headers)

    return "\n".join(_headers)


def format_set_cookies(headers):

    _cookies = []

    if "set-cookie" in headers:
        cookies = headers["set-cookie"].split(";")

        for cookie in cookies:
            if "=" not in cookie:
                value = "True"
                key = cookie
            else:
                key, value = cookie.split("=", 1)

            if COOKIES_IGNORED.matches(key.strip()):
                continue
            _cookies.append(f"{key.strip()}: {value.strip()}")

    _cookies = sorted(_cookies)
    return "\n".join(_cookies)


def format_get_cookies(headers):

    _cookies = []

    if "cookie" in headers:

        cookies = headers["cookie"].split(";")

        for cookie in cookies:

            if "=" not in cookie:
                value = "True"
                key = cookie.strip()
            else:
                key, value = cookie.split("=", 1)
                key = key.strip()

            if COOKIES_IGNORED.matches(key.strip()):
                continue

            _cookies.append(f"{key}: {value.strip()}")

    _cookies = sorted(_cookies)
    return "\n".join(_cookies)


def body_to_string(body: bytes, content_type: str, is_summary=False):

    if not body:
        return ""

    if content_type.startswith("image"):
        body_hex = body.hex()

        if is_summary:
            return f"Image data: {len(body)} bytes"

        return f"Image data: {len(body)} bytes\n{body_hex}"

    if isinstance(body, str):
        return body

    try:
        return body.decode("utf-8")
    except UnicodeDecodeError:
        return "Could not decode body to utf-8.\nHEX FORMAT:\n" + body.hex()


def format_response(response: db.UserdiffResponse, is_summary=False):

    headers = headers_to_dict(response.headers)

    body = response.get_body()

    body = body_to_string(body, headers.get("content-type", ""), is_summary)

    return f"""
Start URL: {response.start_url}
End URL: {response.end_url}
Status Code: {response.status_code}
Resource Type: {response.resource_type}
---------------------------------------
---Headers---
{format_headers(headers)}
---Set cookies---
{format_set_cookies(headers)}
---Get cookies---
{format_get_cookies(headers)}
----------------------------------------
BODY:

{body}

        """


def format_request(request: db.UserdiffRequest, is_summary=False):

    headers = headers_to_dict(request.headers)

    body = request.body

    body = body_to_string(body, headers.get("content-type", ""), is_summary)

    return f"""
Method: {request.method}
---------------------------------------
---Headers---
{format_headers(headers)}
---Set cookies---
{format_set_cookies(headers)}
---Get cookies---
{format_get_cookies(headers)}
----------------------------------------
BODY:

{body}

        """


def diff_strings(str1, str2, tag="resp"):

    if str1 != str2:

        # put them in temp files
        with open("/crawler-data/temp/temp1.txt", "w") as f:
            f.write(str1)

        with open("/crawler-data/temp/temp2.txt", "w") as f:
            f.write(str2)

        head = f"<h1>Diff for {tag}<\/h1>"

        exit_code = os.system(
            (
                f"delta /crawler-data/temp/temp1.txt /crawler-data/temp/temp2.txt "
                + "--file-decoration-style blue --hunk-header-decoration-style blue --pager never --light --max-line-length 0 --wrap-max-lines 1000"
                + " | ansifilter --html"
                + ' | sed "s/<head>/<head><style> body, html {max-width:700px;} pre span {text-wrap:wrap; word-break: break-word;} <\/style>/g"'
                + ' | sed "s/<body>/<body>'
                + head
                + '/g"'
                + f" > /crawler-data/temp/diff/{tag}.html"
            )
        )

        def remove_temp_files():
            if os.path.exists("/crawler-data/temp/temp1.txt"):
                os.remove("/crawler-data/temp/temp1.txt")
            if os.path.exists("/crawler-data/temp/temp2.txt"):
                os.remove("/crawler-data/temp/temp2.txt")

        return remove_temp_files

    else:

        os.system(
            f"echo '<html><head></head><body><h1>Diff for {tag}</h1><h2>No difference found</h1></body></html>' > /crawler-data/temp/diff/{tag}.html"
        )

    return lambda: None


def create_request_template(
    request: db.UserdiffRequest,
    account_id: int,
    variables: dict,
    template: Optional[SwapRequest] = None,
):

    url_path, query_dict = split_url_into_path_and_query(request.url)

    req_instance = RequestInstance(
        account_id,
        request.method,
        url_path,
        headers_to_dict(request.headers),
        query_dict,
        request.body,
    )

    if template:
        template.register_instance(req_instance)
    else:
        template = SwapRequest.build(req_instance, variables)

    return template


def process_candidate(candidate: db.AnalysisCandidatePair, swap_task: db.SwapTask):

    clear_screen()

    def display_header():
        print(f"Task ID: {candidate.task_id}")
        print(f"Candidate pair: {candidate.id}")
        print("------- URLs --------")
        print(f"REQUEST 1: {response1.start_url}")
        print(f"REQUEST 2: {response2.start_url}")
        print(f"==============================================")
        print("")

    response1 = db.UserdiffResponse.get(
        db.UserdiffResponse.response_id == candidate.response_1_id
    )
    response2 = db.UserdiffResponse.get(
        db.UserdiffResponse.response_id == candidate.response_2_id
    )

    account1_id = get_account_id_from_response(response1)
    account2_id = get_account_id_from_response(response2)

    cleanup = diff_strings(format_response(response1), format_response(response2))

    cleanup2 = diff_strings(
        format_request(response1.request), format_request(response2.request), tag="req"
    )

    def action_print_req1():
        clear_screen()
        display_header()

        print("------- RESPONSES --------")

        print("RESPONSE 1")
        print(format_response(response1, is_summary=True))

        print("------- REQUESTS --------")
        print("REQUEST 1")
        print(format_request(response1.request, is_summary=True))

        print("RESPONSE 2")
        print(format_response(response2, is_summary=True))

        print("------- REQUESTS --------")
        print("REQUEST 2")
        print(format_request(response2.request, is_summary=True))

        return True

    def action_add_note(_continue=True):
        clear_screen()
        display_header()

        note = multiline_input(
            "Enter your note:", candidate.note if candidate.note else ""
        )
        candidate.note = note
        candidate.save()

        return _continue

    def action_create_swap_candidate():

        clear_screen()
        display_header()

        variables = {}

        # keep asking until the user is satisfied
        while True:
            variable = input(
                "Enter the relevant variables in this session (e.g. 'user_id=1234'): "
            )
            if not variable:
                break
            name, value = variable.split("=", 1)

            variables[name] = value

        template = create_request_template(response1.request, account1_id, variables)
        template = create_request_template(
            response2.request, account2_id, variables, template
        )

        print("Template preview:")
        print(template.preview())

        should_save = bullet.YesNo(
            "Do you want to save this template?", default="Y"
        ).launch()

        if not should_save:
            return action_create_swap_candidate()

        # query the locations to swap specific templates
        interest_variables = defaultdict(dict)
        for variable in variables:

            choices = multi_choice_list(
                f"Where do you want to swap {variable}? (space to select, enter to submit)",
                ["all", "do not swap", "url", "header", "body"],
            )

            if "all" in choices:
                interest_variables[variable] = {"where": ["default"]}
            elif "do not swap" in choices:
                continue
            else:
                interest_variables[variable] = {"where": choices}

        print(json.dumps(interest_variables, indent=2))

        print(template.to_dict())

        # add swap candidate
        swap_candidate = db.SwapCandidatePair.create(
            candidate_pair=candidate,
            task=swap_task,
            swap_request_representation=template.to_dict(),
            representation_hash=template.hash(),
            interest_variables=interest_variables,
        )

        print("Swap candidate created.")

        # go to the next candidate

        return False

    actions = {
        "Show full request/response": action_print_req1,
        "Edit note": lambda: action_add_note(_continue=True),
        "Edit note and next": lambda: action_add_note(_continue=False),
        "Create swap candidate": action_create_swap_candidate,
        "Skip": lambda: False,
    }

    def wait_for_action():
        display_header()
        action = choice_list("Choose an action", list(actions.keys()))
        return actions[action]()

    ask_again = wait_for_action()

    while ask_again:
        ask_again = wait_for_action()

    _continue = bullet.YesNo(
        "Do you want to continue candidates?", default="Y"
    ).launch()

    cleanup()
    cleanup2()

    return _continue


def start_server_subprocess():

    # DEV: stopped the httpwatcher because it was refreshing constantly and making it
    # hard to copy from the text in the browser.

    # prc = subprocess.Popen(
    #     ["httpwatcher", "--root", "/crawler-data/temp/diff/", "--no-browser"],
    #     stdout=subprocess.DEVNULL,
    #     stderr=subprocess.DEVNULL,
    # )

    browser_prcs = []

    for tag in ["resp", "req"]:
        _p = subprocess.Popen(
            # ["playwright", "open", "http://localhost:5555/" + tag + ".html"],
            ["playwright", "open", "file:///crawler-data/temp/diff/" + tag + ".html"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        browser_prcs.append(_p)

    # return (prc, *browser_prcs)
    return browser_prcs


def stop_server_subprocess(prcs):

    for prc in prcs:
        prc.terminate()
        prc.wait()


def process_task(task: db.AnalysisTask, actor_name: str, config: dict):

    try:

        os.system("echo " " > /crawler-data/temp/diff/resp.html")
        os.system("echo " " > /crawler-data/temp/diff/req.html")

        prcs = start_server_subprocess()

        candidates = task.candidate_pairs

        if config.get("diff_url_body_only") or config.get("one_example_only"):

            candidates = candidates.select(
                db.AnalysisCandidatePair, db.UserdiffResponse
            ).join(
                db.UserdiffResponse,
                on=(
                    db.UserdiffResponse.response_id
                    == db.AnalysisCandidatePair.response_1_id
                ),
                attr="response_1",
            )

        if not config.get("all_pairs"):
            processed_candidates = db.SwapCandidatePair.select(
                db.SwapCandidatePair.candidate_pair
            ).where(db.SwapCandidatePair.task == task)
            candidate_ids = [c.candidate_pair.id for c in processed_candidates]
            candidates = candidates.where(
                db.AnalysisCandidatePair.id.not_in(candidate_ids)
            )

        if config.get("diff_url_body_only"):

            # response_1 . start_url != response_2 . start_url
            _candidates = []

            for candidate in candidates:
                response_2 = db.UserdiffResponse.get(
                    db.UserdiffResponse.response_id == candidate.response_2_id
                )
                if (
                    sanitize_url(candidate.response_1.start_url)
                    != sanitize_url(response_2.start_url)
                    or candidate.response_1.request.body != response_2.request.body
                ):
                    _candidates.append(candidate)

            candidates = _candidates

        if config.get("one_example_only"):
            # for each row of each group, only get the first row
            _candidates = {}

            for candidate in candidates:
                key = (
                    candidate.response_1.start_url.split("?")[0],
                    candidate.response_1.request.method,
                )
                if key not in _candidates:
                    _candidates[key] = candidate

            candidates = list(_candidates.values())

        # get or create a swap task
        if len(candidates) == 0:
            stop_server_subprocess(prcs)
            return

        swap_task = (
            db.SwapTask.select()
            .where(
                db.SwapTask.subject_id == task.subject_id,
                db.SwapTask.actor == actor_name,
                db.SwapTask.status_name == "preparing",
            )
            .first()
        )

        if not swap_task:

            first_candidate = candidates[0]
            session_1 = get_session_id_from_response(first_candidate.response_1)

            swap_task = db.SwapTask.create(
                subject_id=task.subject_id,
                actor=actor_name,
                status_name="preparing",
                task_type="auto",
                session_id=session_1,
            )

        # only get candidates that are not processed

        for candidate in candidates:
            _continue = process_candidate(candidate, swap_task)

            if not _continue:
                break

        stop_server_subprocess(prcs)

        # should we publish the swap task?
        should_publish = bullet.YesNo(
            "Do you want to publish the swap task?", default="N"
        ).launch()

        if should_publish:
            swap_task.status_name = "waiting_session"
            swap_task.save()

    except Exception as e:
        # update_task_status(task, "error")
        stop_server_subprocess(prcs)
        raise e


def start_manual_work_session(config: dict):

    # setup
    os.makedirs("/crawler-data/temp", exist_ok=True)
    os.makedirs("/crawler-data/temp/diff", exist_ok=True)

    print(
        """
    Welcome to the manual analysis session.
    """
    )

    actor_name = input("Enter your name: ")

    tasks = get_tasks_to_process()

    if tasks is None:
        print("No tasks to process.")
        return

    while tasks:

        # clear the command line
        clear_screen()

        task_by_choice = dict(zip(tasks_to_choices(tasks), tasks))

        task_id = choice_list("Choose a task to process", list(task_by_choice.keys()))

        task = task_by_choice[task_id]

        process_task(task, actor_name, config)

        _ = bullet.YesNo("Do you want to continue tasks?", default="Y").launch()

        if not _:
            clear_screen()
            print("Ending session.")
            break

        tasks = get_tasks_to_process()

    if tasks is None:
        clear_screen()
        print("No tasks to process.")
        return


if __name__ == "__main__":

    parser = argparse.ArgumentParser(description="Manual analysis session")

    parser.add_argument(
        "--all-pairs",
        action="store_true",
        help="Show me all pairs even if they are already processed",
    )

    parser.add_argument(
        "--diff-url-body-only",
        action="store_true",
        help="Only show me pairs that have different URLs or body",
    )

    parser.add_argument(
        "--one-example-only",
        action="store_true",
        help="Show me only one example of requests with the same URL and method",
    )

    args = parser.parse_args()

    start_manual_work_session(
        config={
            "all_pairs": args.all_pairs,
            "diff_url_body_only": args.diff_url_body_only,
            "one_example_only": args.one_example_only,
        }
    )
