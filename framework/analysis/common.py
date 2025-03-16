
import db


def get_session_id_from_response(response: db.UserdiffResponse):

    # get the userdiff_report from the response
    userdiff_report = db.UserdiffReport.get(
        db.UserdiffReport.report_id == response.report
    )

    # get the session from the userdiff_report
    return userdiff_report.session_id