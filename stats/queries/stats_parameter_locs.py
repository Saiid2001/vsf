from collections import defaultdict
from common import *  # pylint: disable=import-error

__dir__ = Path(__file__).parent
filename = __file__.split("/")[-1].replace(".py", "")
THIS_RESULTS_DIR = RESULTS_DIR / filename
THIS_RESULTS_DIR.mkdir(parents=True, exist_ok=True)

results = {}


# REQUEST_IDS_USED_IN_SWAP_CANDIDATES = """--sql
# select distinct userdiff_request.request_id from userdiff_response
# join userdiff_request on userdiff_request.request_id = userdiff_response.request_id
# where userdiff_response.response_id in (
# 	select distinct response_1_id from analysis_candidate_pairs
# 	where task_id in (
# 		select max(id) from analysis_tasks
# 		group by subject_id	
# 	)
#     and result_name='cpv'
# )
# or userdiff_response.response_id in (
# 	select distinct response_2_id from analysis_candidate_pairs
# 	where task_id in (
# 		select max(id) from analysis_tasks
# 		group by subject_id	
# 	)
#     and result_name='cpv'
# )
# """

# with db.cursor() as cursor:
#     cursor.execute(REQUEST_IDS_USED_IN_SWAP_CANDIDATES)
#     request_rows = cursor.fetchall()

# RELEVANT_REQUEST_IDS = [row["request_id"] for row in request_rows]

# # \texttt{auth}, \texttt{jwt}, \texttt{api-key}, \texttt{session}, \texttt{client-id}, and \texttt{client-secret}.

# HEADER_KEYWORDS = [
#     "authoriz",
#     "authentic",
#     "jwt",
#     "session",
#     "bearer"
#     # "client-id",
#     # "client-secret",
# ]

# MATCHING_REQUEST_HEADERS = """--sql
# select distinct task_id, regexp_replace(url, '\?[^/]*$','\\1') as request_url, name from userdiff_request_headers
# join userdiff_request on userdiff_request.request_id = userdiff_request_headers.request_id
# join userdiff_report on userdiff_request.report_id = userdiff_report.report_id
# where userdiff_request.request_id in ({})
# and {}
# """.format(
#     ",".join(str(x) for x in RELEVANT_REQUEST_IDS)
#     , " or ".join(f"name ilike '%{x}%'" for x in HEADER_KEYWORDS)
# )

# with db.cursor() as cursor:
#     cursor.execute(MATCHING_REQUEST_HEADERS)
#     request_having_headers_rows = cursor.fetchall()

# request_having_headers_rows = pd.DataFrame(request_having_headers_rows, columns=["task_id", "request_url", "name"])

# # get distinct cookie names

# SESSION_COOKIES = [
#     "sessionid", 
#     "JSESSIONID",
#     "sessionId",
#     "PHPSESSID",
#     "_cfuvid",
#     "cookies",
#     "_csrf_token",
#     "CSRF-TOKEN",
#     "session",
#     "__RequestVerificationToken",
#     "device",
# ]

# SESSION_COOKIES_QUERY = """--sql
# select distinct task_id, regexp_replace(url, '\?[^/]*$','\\1') as request_url, name from userdiff_request_headers
# join userdiff_request on userdiff_request.request_id = userdiff_request_headers.request_id
# join userdiff_report on userdiff_request.report_id = userdiff_report.report_id
# where userdiff_request.request_id in ({})
# and ({})
# """.format(
#     ",".join(str(x) for x in RELEVANT_REQUEST_IDS)
#     , (
#         " or ".join(f"name ilike '%{x}%'" for x in SESSION_COOKIES)
#         + " or "
#         + " or ".join(f"name ilike '{x}'" for x in SESSION_COOKIES)
#     )
# )

# with db.cursor() as cursor:

#     cursor.execute(SESSION_COOKIES_QUERY)
#     requests_having_cookies = cursor.fetchall()
    
# requests_having_cookies = pd.DataFrame(requests_having_cookies, columns=["task_id", "request_url", "name"])

# unique_tasks = list(set(list(requests_having_cookies["task_id"].unique()) + list(request_having_headers_rows["task_id"].unique())))

# # counts per task
# results['tasks'] = []

# for task_id in unique_tasks:
#     task_request_cookies = set(requests_having_cookies[requests_having_cookies["task_id"] == task_id]['request_url'].values.to_list())
#     task_request_headers = set(request_having_headers_rows[request_having_headers_rows["task_id"] == task_id].values.to_list())
    
#     n_headers_only = len(task_request_headers - task_request_cookies)
#     n_cookies_only = len(task_request_cookies - task_request_headers)
#     n_headers_and_cookies = len(task_request_cookies & task_request_headers)
    
#     results['tasks'].append({
#         "task_id": task_id,
#         "n_headers_only": n_headers_only,
#         "n_cookies_only": n_cookies_only,
#         "n_headers_and_cookies": n_headers_and_cookies
#     })
    
#     print(f"Task {task_id}: {n_headers_only} headers only, {n_cookies_only} cookies only, {n_headers_and_cookies} both")


TEMPLATES_QUERY = """--sql

select id, task_id, swap_request_representation #>> '{template, url_path, template}' as url_template from swap_candidate_pairs

where task_id in (
	select max(id) from swap_tasks
	group by subject_id
)

and state='finished';

"""

with db.cursor() as cursor:
    cursor.execute(TEMPLATES_QUERY)
    templates = cursor.fetchall()
    
templates = pd.DataFrame(templates, columns=["candidate_id", "task_id", "url_template"])
    
    
print(f"Unique tasks: {len(templates['task_id'].unique())}")
    

manual_analysis_df = pd.read_csv(__dir__ / "manual_analysis.csv")

manual_analysis_df = manual_analysis_df.merge(templates, left_on="candidate_id", right_on="candidate_id", how="left")

print(f"API candidates: {len(manual_analysis_df[manual_analysis_df['request_nature'] == 'api'])}")

print(f"Unique API templates: {len(manual_analysis_df[manual_analysis_df['request_nature'] == 'api']['url_template'].unique())}")
    
SWAP_REQUEST_DOMAINS = """--sql
select candidate_id, regexp_replace(url, 'https?://([^/]+).*', '\\1') as domain from swap_request
"""

with db.cursor() as cursor:
    cursor.execute(SWAP_REQUEST_DOMAINS)
    request_rows = cursor.fetchall()
    
swap_request_domains = pd.DataFrame(request_rows, columns=["candidate_id", "domain"])

# labels distribution for each url_template

_manual_analysis_df = manual_analysis_df[manual_analysis_df['request_nature'] != 'api']

print(manual_analysis_df.groupby(["url_template", "label"]).size().reset_index().label.value_counts())
print(_manual_analysis_df.groupby(["url_template", "label"]).size().reset_index().label.value_counts())

# the location of parameters across tasks and across templates

credential_locs = manual_analysis_df[(manual_analysis_df['request_nature'] == 'api') & ~manual_analysis_df['credential_loc'].isna()]

# task_credential_locs = credential_locs.groupby(["task_id", "credential_loc"]).size().reset_index().groupby("task_id").apply(lambda x: x.nlargest(1, 0)).reset_index(drop=True)

print(credential_locs.credential_loc.value_counts())

object_id_locs = manual_analysis_df[(manual_analysis_df['request_nature'] == 'api') & ~manual_analysis_df['object_id_loc'].isna()]

print(object_id_locs.object_id_loc.value_counts())

# status codes
status_codes = manual_analysis_df[ (manual_analysis_df['AC_related'] == 1) & manual_analysis_df['label'].isna() ]

print(status_codes.status_code.value_counts())


# vulnerable url_templates
vulnerable_url_templates = manual_analysis_df[manual_analysis_df['label'].isin(['Vulnerability', 'Weak Vulnerability', 'Weak Vulnerability. Hard to guess value'])]

print(f"AC Violations URL templates: {len(vulnerable_url_templates['url_template'].unique())}")
print(f"AC Violations tasks: {len(vulnerable_url_templates['task_id'].unique())}")


# vulnerable url_templates
vulnerable_url_templates = manual_analysis_df[manual_analysis_df['label'].isin(['Vulnerability'])]

print(f"Vulnerable URL templates: {len(vulnerable_url_templates['url_template'].unique())}")
print(f"Vulnerable tasks: {len(vulnerable_url_templates['task_id'].unique())}")



# 66 errors
# 8 200s
# 3 302s and 303s
# external + cloudflare 422 500 and 402


# USERDIFF_REQUEST_DOMAINS = """--sql
# select request_id, regexp_replace(url, 'https?://([^/]+).*', '\\1') as domain from userdiff_request
# join userdiff_report on userdiff_request.report_id = userdiff_report.report_id
# join visit_tasks on userdiff_report.task_id = visit_tasks.id
# join visit_task_results on visit_tasks.result_name = visit_task_results.name
# where userdiff_report.task_id in (
#     select max(id) from visit_tasks group by subject_id
#     -- join visit_task_results on visit_tasks.result_name = visit_task_results.name
#     -- where visit_task_results.success
# )
# and visit_task_results.success
# """

# with db.cursor() as cursor:
#     cursor.execute(USERDIFF_REQUEST_DOMAINS)
#     request_rows = cursor.fetchall()
    
# userdiff_request_domains = pd.DataFrame(request_rows, columns=["request_id", "domain"])

# # merge the two dataframes
# merged = pd.merge(swap_request_domains, userdiff_request_domains, left_on="domain", right_on="domain", how="inner")


# merged.to_csv(THIS_RESULTS_DIR / "domain_matches.csv", index=False)