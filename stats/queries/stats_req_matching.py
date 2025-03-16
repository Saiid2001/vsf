from common import *  # pylint: disable=import-error

filename = __file__.split("/")[-1].replace(".py", "")
THIS_RESULTS_DIR = RESULTS_DIR / filename
THIS_RESULTS_DIR.mkdir(parents=True, exist_ok=True)

__dir__ = Path(__file__).parent

sys.path.append(str(__dir__ / "../../framework/analysis"))

from reqresp import IRequestResponse
import matching_heuristic
import prefilter


class _Request:

    def __init__(self, row):

        self.request_id = row["request_id"]
        self.report_id = row["report_id"]
        self.client_frame_id = row["client_frame_id"]
        self.url = row["url"]
        self.method = row["method"]
        self.headers = []
        self.body = row["body"]


class _Response:

    def __init__(self, row):
        self.request = _Request(row)
        self.response_id = row["response_id"]
        self.request_id = row["request_id"]
        self.status_code = row["status_code"]
        self.headers = []
        self.hash = row["hash"]
        self.resource_type = row["resource_type"]


VISIT_TASKS = """--sql
select max(visit_tasks.id) as task_id, subject_id, subjects.start_url from visit_tasks
join visit_task_results on visit_tasks.result_name = visit_task_results.name
join subjects on visit_tasks.subject_id = subjects.id
where visit_task_results.success
group by subject_id,  subjects.start_url ;
"""

SUBJECT_REQUEST_RESPONSES = """--sql
select userdiff_request.*, userdiff_response.* from userdiff_request
join userdiff_response using (request_id)
join userdiff_report on userdiff_request.report_id = userdiff_report.report_id
where userdiff_request.request_id in (
    select max(request_id) from userdiff_request
    group by regexp_replace(url, '\?[^/]*$','\\1'), report_id
)
and task_id = {}
order by userdiff_request.report_id;
"""


def compute_task_results(task):
    task_results = {
        "task_id": task["task_id"],
        "subject_id": task["subject_id"],
        "start_url": task["start_url"],
    }

    task_id = task["task_id"]

    cur.execute(SUBJECT_REQUEST_RESPONSES.format(task_id))
    reqresps = cur.fetchall()

    print(f"Subject {task_id} has {len(reqresps)} request-responses")
    task_results["n_reqresps"] = len(reqresps)

    rows_from_first_report = []
    rows_from_second_report = []

    curr_report_id = None
    for reqresp in reqresps:
        if curr_report_id is None:
            curr_report_id = reqresp["report_id"]

        if reqresp["report_id"] == curr_report_id:
            rows_from_first_report.append(reqresp)
        else:
            rows_from_second_report.append(reqresp)

    print(f"First report has {len(rows_from_first_report)} request-responses")
    task_results["n_reqresps1"] = len(rows_from_first_report)
    print(f"Second report has {len(rows_from_second_report)} request-responses")
    task_results["n_reqresps2"] = len(rows_from_second_report)

    # prepare IRequestResponse objects

    reqresps1 = [IRequestResponse(_Response(row)) for row in rows_from_first_report]
    reqresps2 = [IRequestResponse(_Response(row)) for row in rows_from_second_report]

    # prefilter
    reqresps1, _ = prefilter.filter_by_adblocker(reqresps1, task["start_url"])
    reqresps2, _ = prefilter.filter_by_adblocker(reqresps2, task["start_url"])

    print(f"First report has {len(reqresps1)} request-responses after prefiltering")
    task_results["n_reqresps1_after_prefilter"] = len(reqresps1)
    print(f"Second report has {len(reqresps2)} request-responses after prefiltering")
    task_results["n_reqresps2_after_prefilter"] = len(reqresps2)

    n_union = len(set([reqresp.request.url for reqresp in reqresps1 + reqresps2]))
    print(f"Union of prefiltered request-responses has {n_union} unique URLs")
    task_results["n_union_prefiltered"] = n_union

    # try matching
    matches, _ = matching_heuristic.match_requests(reqresps1, reqresps2, debug=False)

    print(f"Found {len(matches)} matches")
    task_results["n_matches"] = len(matches)

    overlap_coeff = (
        len(matches) / min(len(reqresps1), len(reqresps2))
        if min(len(reqresps1), len(reqresps2)) > 0
        else 0
    )
    print(f"Overlap Coefficient: {overlap_coeff}")
    task_results["overlap_coeff"] = overlap_coeff

    jaccaard_similarity = len(matches) / n_union if n_union > 0 else 0
    print(f"Jaccard Similarity: {jaccaard_similarity}")
    task_results["jaccard_similarity"] = jaccaard_similarity
    return task_results


# results= {}
# with db.cursor() as cur:
#     cur.execute(VISIT_TASKS)
#     tasks = cur.fetchall()

#     results["tasks"] = []

#     # # parallelize
#     # with ThreadPool() as p:
#     #     results["tasks"] = p.map(compute_task_results, tasks)


#     for task in tasks:
#         task_results = compute_task_results(task)
#         results["tasks"].append(task_results)

results = json.load(open(THIS_RESULTS_DIR / "results.json"))

# plot histogram of overlap coefficients
overlap_coeffs = [task["overlap_coeff"] for task in results["tasks"]]
jaccard_coefficients = [task["jaccard_similarity"] for task in results["tasks"]]

fig, ax = plt.subplots(figsize=(8, 4))
pd.Series(overlap_coeffs).plot.hist(
    bins=25,
    ax=ax,
    label="Overlap Coeff",
    histtype="step",
    linewidth=4,
    facecolor="#5099E9",
    edgecolor="black",
    hatch="//",
    fill=True,
)
pd.Series(jaccard_coefficients).plot.hist(
    bins=25,
    ax=ax,
    label="Jaccard Similarity",
    facecolor="#4CA48A",
    histtype="step",
    linewidth=4,
    edgecolor="black",
    hatch="\\\\",
    fill=True,
    alpha=0.5,
)
pd.Series(jaccard_coefficients).plot.hist(
    bins=25,
    ax=ax,
    facecolor="gray",
    histtype="step",
    linewidth=4,
    edgecolor="black",
    hatch="\\\\",
)
mean = np.mean(overlap_coeffs)
median = np.median(overlap_coeffs)
results["overlap_coeff"] = {
    "mean": mean,
    "median": median,
    "z25": np.percentile(overlap_coeffs, 25),
}

ax.set_title("")
# ax.set_xlabel("Overlap Coeff")
ax.set_ylabel("Nb. Sites")
fig.tight_layout()
plt.legend()
plt.savefig(THIS_RESULTS_DIR / "request_overlap.pdf")
plt.close()


print(f"Mean overlap coefficient: {mean}")


fig, ax = plt.subplots()
pd.Series(jaccard_coefficients).plot.hist(bins=20, ax=ax)
mean = np.mean(jaccard_coefficients)
median = np.median(jaccard_coefficients)
results["jaccard_similarity"] = {
    "mean": mean,
    "median": median,
    "z25": np.percentile(jaccard_coefficients, 25),
}

ax.set_title("Jaccard Similarity of Request-Response Pairs")
ax.set_xlabel("Jaccard Similarity")
ax.set_ylabel("Frequency")
plt.savefig(THIS_RESULTS_DIR / "request_jaccard.pdf")
plt.close()

print(f"Mean Jaccard Similarity: {mean}")

with open(THIS_RESULTS_DIR / "results.json", "w") as f:
    json.dump(results, f, indent=2)
