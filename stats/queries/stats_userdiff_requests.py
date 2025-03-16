from common import *  # pylint: disable=import-error

filename = __file__.split("/")[-1].replace(".py", "")
THIS_RESULTS_DIR = RESULTS_DIR / filename
THIS_RESULTS_DIR.mkdir(parents=True, exist_ok=True)
results = {}

TOTAL_USERDIFF_REQUESTS = """--sql
select count(distinct regexp_replace(url, '\?[^/]*$','\\1')) as "unique", count(url) as "all" from userdiff_request
join userdiff_report on userdiff_report.report_id = userdiff_request.report_id
where userdiff_report.task_id in (
    select max(id) from visit_tasks group by subject_id
);
"""

TOTAL_FIRST_PARTY_REQUESTS = """--sql
select count(distinct regexp_replace(url, '\?[^/]*$','\\1')) from (
    SELECT
        "url",
        regexp_replace(url, '^(?:https?://)?([^/]+).*','\\1') AS tld,
        domains.name as domain
    FROM 
        userdiff_request
    join userdiff_report on userdiff_report.report_id = userdiff_request.report_id
    join subjects on userdiff_report.subject_id = subjects.id
    join domains on domains.id = subjects.domain_id
    )
where tld like '%' || domain
"""

TOTAL_MATCHES = """--sql
select count(distinct regexp_replace(userdiff_request.url, '\?[^/]*$','\\1')) from userdiff_response
join userdiff_request on userdiff_request.request_id = userdiff_response.request_id
where userdiff_response.response_id in (
	select distinct response_1_id from analysis_candidate_pairs
	where task_id in (
		select max(id) from analysis_tasks
		where result_name='as'
		group by subject_id	
	)
)

or userdiff_response.response_id in (
	select distinct response_2_id from analysis_candidate_pairs
	where task_id in (
		select max(id) from analysis_tasks
		where result_name='as'
		group by subject_id	
	)
)
"""

TOTAL_REQUESTS_REFRENCE_FOR_SWAP = """--sql
select count(distinct regexp_replace(userdiff_request.url, '\?[^/]*$','\\1')) from userdiff_response
join userdiff_request on userdiff_request.request_id = userdiff_response.request_id
where userdiff_response.response_id in (
	select distinct response_1_id from analysis_candidate_pairs
	where task_id in (
		select max(id) from analysis_tasks
		where result_name='as'
		group by subject_id	
	)
    and result_name='cpv'
)

or userdiff_response.response_id in (
	select distinct response_2_id from analysis_candidate_pairs
	where task_id in (
		select max(id) from analysis_tasks
		where result_name='as'
		group by subject_id	
	)
    and result_name='cpv'
)
"""

with db.cursor() as cur:
    cur.execute(TOTAL_USERDIFF_REQUESTS)
    ans = cur.fetchone()
    total_requests = ans["all"]
    total_unique_requests = ans["unique"]

print(f"# total collected requests: {total_requests}")
print(
    f"# unique collected requests: {total_unique_requests}, {percent(total_unique_requests, total_requests)} from total"
)
results["total_requests"] = total_requests
results["total_unique_requests"] = total_unique_requests

with db.cursor() as cur:
    cur.execute(TOTAL_FIRST_PARTY_REQUESTS)
    total_first_party_requests = cur.fetchone()["count"]

print(
    f"# first party requests: {total_first_party_requests} ({percent(total_first_party_requests, total_unique_requests)}) from unique collected requests"
)
results["total_first_party_requests"] = total_first_party_requests

with db.cursor() as cur:
    cur.execute(TOTAL_MATCHES)
    total_matches = cur.fetchone()["count"]

print(
    f"# matches: {total_matches} ({percent(total_matches, total_unique_requests)}) from unique collected requests"
)
results["total_matches"] = total_matches

with db.cursor() as cur:
    cur.execute(TOTAL_REQUESTS_REFRENCE_FOR_SWAP)
    total_unique_swap_ref = cur.fetchone()["count"]

print(
    f"# unique reference requests for swap: {total_unique_swap_ref} ({percent(total_unique_swap_ref, total_unique_requests)}) from unique collected requests"
)
results["total_unique_swap_ref"] = total_unique_swap_ref

# RESOURCE TYPES
RESOURCE_TYPES = """--sql
select distinct resource_type, count(resource_type) as count from userdiff_request
join userdiff_report on userdiff_report.report_id = userdiff_request.report_id
where userdiff_report.task_id in (
    select max(id) from visit_tasks group by subject_id
)
group by resource_type
order by count desc;
"""

fig, ax = plt.subplots()

with db.cursor() as cur:
    cur.execute(RESOURCE_TYPES)
    _results = cur.fetchall()
    df = pd.DataFrame(_results, columns=["resource_type", "count"])
    df.set_index("resource_type", inplace=True)
    df.plot(kind="bar", ax=ax)
    ax.set_xlabel("Resource type")
    ax.set_ylabel("Number of requests")
    ax.set_title("Resource types")
    fig.savefig(THIS_RESULTS_DIR / "resource_types.pdf")

print(df)
results["resource_types"] = df.to_dict()

# REQUEST METHODS
REQUEST_METHODS = """--sql
select distinct method, count(method) as count from userdiff_request
join userdiff_report on userdiff_report.report_id = userdiff_request.report_id
where userdiff_report.task_id in (
    select max(id) from visit_tasks group by subject_id
)
-- and userdiff_request.request_id in (
--   select max(request_id) from userdiff_response group by url
--)
group by method
order by count desc;
"""

fig, ax = plt.subplots()
with db.cursor() as cur:
    cur.execute(REQUEST_METHODS)
    _results = cur.fetchall()
    df = pd.DataFrame(_results, columns=["method", "count"])
    df.set_index("method", inplace=True)
    df.plot(kind="bar", ax=ax)
    ax.set_xlabel("Request method")
    ax.set_ylabel("Number of requests")
    ax.set_title("Request methods")
    fig.savefig(THIS_RESULTS_DIR / "request_methods.pdf")

print(df)
results["request_methods"] = df.to_dict()

# STATUS CODES
STATUS_CODES = """--sql
select distinct status_code, count(status_code) as count from userdiff_response
join userdiff_request on userdiff_request.request_id = userdiff_response.request_id
join userdiff_report on userdiff_report.report_id = userdiff_request.report_id
where userdiff_report.task_id in (
    select max(id) from visit_tasks group by subject_id
)
group by status_code
order by count desc;
"""

fig, ax = plt.subplots()
with db.cursor() as cur:
    cur.execute(STATUS_CODES)
    _results = cur.fetchall()
    df = pd.DataFrame(_results, columns=["status_code", "count"])
    df.set_index("status_code", inplace=True)
    df.plot(kind="bar", ax=ax)
    ax.set_xlabel("Status code")
    ax.set_ylabel("Number of responses")
    ax.set_title("Status codes")
    fig.savefig(THIS_RESULTS_DIR / "status_codes.pdf")

print(df)
results["status_codes"] = df.to_dict()


with open(THIS_RESULTS_DIR / "results.json", "w") as f:
    json.dump(results, f, indent=2)
