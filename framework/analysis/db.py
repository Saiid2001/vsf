import datetime
import gzip
import json
import config
from peewee import *


db = PostgresqlDatabase(
    config.DB_NAME,
    user=config.DB_USER,
    password=config.DB_PASSWORD,
    host=config.DB_HOST,
    port=config.DB_PORT,
)


class JsonField(Field):
    db_field = "jsonb"

    def db_value(self, value):
        return json.dumps(value)

    def python_value(self, value):
        return value


class SubjectStatus:
    UNVISITED = "UNVISITED"
    PROCESSING = "PROCESSING"
    VISITED = "VISITED"
    SKIP = "SKIP"
    FAILED = "FAILED"


class Subject(Model):
    id = AutoField()
    type = IntegerField()
    start_url = TextField()
    final_url = TextField()
    additional_information = TextField()
    visitation_begin = DateTimeField()
    visitation_end = DateTimeField()
    url_id = IntegerField()
    domain_id = IntegerField()
    session_group_id = IntegerField()

    class Meta:
        database = db
        table_name = "subjects"


class Session(Model):
    id = AutoField()
    session_information = JsonField()
    session_data = JsonField()
    session_status = TextField()
    group_id = IntegerField()
    experiment = TextField(null=True)
    created_at = DateTimeField()
    updated_at = DateTimeField()

    class Meta:
        database = db
        table_name = "sessions"


class UserdiffReport(Model):
    report_id = AutoField()
    subject = ForeignKeyField(Subject, backref="reports")
    created_at = DateTimeField()
    updated_at = DateTimeField()
    session_id = IntegerField()

    class Meta:
        database = db
        table_name = "userdiff_report"


class UserdiffFrame(Model):
    frame_id = AutoField()
    report = ForeignKeyField(UserdiffReport, backref="frames")
    frame_src = TextField()
    end_url = TextField()
    client_frame_id = TextField()
    title = TextField()
    is_main_frame = BooleanField()
    created_at = DateTimeField()
    updated_at = DateTimeField()
    is_from_interaction = BooleanField()

    class Meta:
        database = db
        table_name = "userdiff_frame"


class UserdiffMirrorEvent(Model):
    id = AutoField()
    event_id = IntegerField()
    type = TextField()
    event_data = TextField()
    created_at = DateTimeField()
    subject = ForeignKeyField(Subject, backref="mirror_events")

    class Meta:
        database = db
        table_name = "userdiff_mirror_event"


class UserdiffInteraction(Model):
    interaction_id = AutoField()
    interaction_type = TextField()
    created_at = DateTimeField()
    frame = ForeignKeyField(UserdiffFrame, backref="interactions")
    report = ForeignKeyField(UserdiffReport, backref="interactions")
    api_name = TextField()
    params = TextField()
    duration = FloatField()

    class Meta:
        database = db
        table_name = "userdiff_interaction"


class UserdiffRequest(Model):
    request_id = AutoField()
    report = ForeignKeyField(UserdiffReport, backref="requests")
    client_frame_id = TextField()
    method = TextField()
    url = TextField()
    is_navigation_request = BooleanField()
    resource_type = TextField()
    is_from_main_frame = BooleanField()
    params = TextField()
    body = TextField()
    created_at = DateTimeField()
    updated_at = DateTimeField()

    class Meta:
        database = db
        table_name = "userdiff_request"


class UserdiffRequestHeaders(Model):
    header_id = AutoField()
    request = ForeignKeyField(UserdiffRequest, backref="headers")
    name = TextField()
    value = TextField()
    created_at = DateTimeField()
    updated_at = DateTimeField()

    class Meta:
        database = db
        table_name = "userdiff_request_headers"


class UserdiffResponse(Model):
    response_id = AutoField()
    report = ForeignKeyField(UserdiffReport, backref="responses")
    client_frame_id = TextField()
    request = ForeignKeyField(UserdiffRequest, backref="response")
    start_url = TextField()
    end_url = TextField()
    status_code = IntegerField()
    status_line = TextField()
    sizes = TextField()
    timing = TextField()
    hash = TextField()
    resource_type = TextField()
    is_from_main_frame = BooleanField()
    created_at = DateTimeField()
    updated_at = DateTimeField()

    class Meta:
        database = db
        table_name = "userdiff_response"

    def get_body(self):

        if not self.hash:
            return None
        return UserdiffBody.from_hash(self.hash)


class UserdiffBody(Model):
    body_id = AutoField()
    hash = TextField()
    body = BlobField()
    created_at = DateTimeField()
    updated_at = DateTimeField()

    class Meta:
        database = db
        table_name = "userdiff_body"

    @staticmethod
    def from_hash(_hash: str):
        bodyObj = UserdiffBody.get(UserdiffBody.hash == _hash)
        return gzip.decompress(bodyObj.body)


class UserdiffResponseHeaders(Model):
    header_id = AutoField()
    response = ForeignKeyField(UserdiffResponse, backref="headers")
    name = TextField()
    value = TextField()
    created_at = DateTimeField()
    updated_at = DateTimeField()

    class Meta:
        database = db
        table_name = "userdiff_response_headers"


class Task(Model):
    id = AutoField()
    created_at = DateTimeField(default=datetime.datetime.now)
    updated_at = DateTimeField(default=datetime.datetime.now)
    status_name = TextField()
    result_name = TextField(null=True)
    note = TextField(null=True)
    actor = TextField()
    task_type = TextField()
    subject = ForeignKeyField(Subject)
    result_name = TextField()


class PreanalysisTask(Task):

    class Meta:
        database = db
        table_name = "preanalysis_tasks"

    is_live = BooleanField(default=False)


class VisitTask(Task):

    class Meta:
        database = db
        table_name = "visit_tasks"


class AnalysisTask(Task):

    class Meta:
        database = db
        table_name = "analysis_tasks"

    is_live = BooleanField(default=False)


class AnalysisCandidatePair(Model):

    id = AutoField()
    task = ForeignKeyField(AnalysisTask, backref="candidate_pairs")
    response_1 = ForeignKeyField(UserdiffResponse)
    response_2 = ForeignKeyField(UserdiffResponse)

    additional_information = JsonField(null=True)
    swappable_keys = JsonField(null=True)

    result_name = TextField(null=True)

    note = TextField(null=True)

    class Meta:
        database = db
        table_name = "analysis_candidate_pairs"


class SwapTask(Task):

    session = ForeignKeyField(Session)
    is_live = BooleanField(default=False)

    class Meta:
        database = db
        table_name = "swap_tasks"



class SwapCandidatePair(Model):

    id = AutoField()
    candidate_pair = ForeignKeyField(AnalysisCandidatePair)
    task = ForeignKeyField(SwapTask)
    swap_request_representation = JsonField()
    representation_hash = TextField()
    interest_variables = JsonField()
    state = TextField(default="free")
    error = TextField(null=True)

    class Meta:
        database = db
        table_name = "swap_candidate_pairs"
