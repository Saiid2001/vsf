from collections import defaultdict
import gzip
from common import *  # pylint: disable=import-error
import braveblock

results = {}
filename = __file__.split("/")[-1].replace(".py", "")
THIS_RESULTS_DIR = RESULTS_DIR / filename
THIS_RESULTS_DIR.mkdir(parents=True, exist_ok=True)

__dir__ = Path(__file__).parent

resources_dir = (__dir__ / "../../framework/analysis/resources").resolve()


def _read_from_filterlist_gzip(file_path: str) -> str:

    with open(file_path, "rb") as _word_frequencies_binary:
        compressed = _word_frequencies_binary.read()

    return gzip.decompress(compressed).decode().splitlines()


ADDITIONAL_BLOCK_RULES = []

with open(resources_dir / "additionalblockrules.txt", "r") as f:
    ADDITIONAL_BLOCK_RULES = f.read().splitlines()

rules = _read_from_filterlist_gzip(resources_dir.absolute() / "easylist_2024.txt.gz")
rules += _read_from_filterlist_gzip(
    resources_dir.absolute() / "easyprivacy_2024.txt.gz"
)
rules += ADDITIONAL_BLOCK_RULES

ADBLOCKER = braveblock.Adblocker(
    rules=rules,
    include_easylist=False,
    include_easyprivacy=False,
)

# Mapping from playwright to braveblock
ADBLOCKER_RESOURCE_TYPE_MAPPING = {
    "document": "Document",
    "stylesheet": "Stylesheet",
    "image": "Image",
    "media": "Media",
    "font": "Font",
    "script": "Script",
    "texttrack": "Other",
    "xhr": "Xmlhttprequest",
    "fetch": "Fetch",
    "eventsource": "Other",
    "websocket": "Websocket",
    "manifest": "Other",
    "other": "Other",
}


def n_blocked(request_rows):

    n_blocked = defaultdict(int)
    for row in request_rows:
        if ADBLOCKER.check_network_urls(
            row["url"],
            row["subject_url"],
            ADBLOCKER_RESOURCE_TYPE_MAPPING.get(row["resource_type"], "Other"),
        ):
            n_blocked[row["subject_url"]] += 1

    return n_blocked


USERDIFF_REQUESTS = """--sql
select distinct regexp_replace(url, '\?[^/]*$','\\1') as url, userdiff_response.resource_type, subjects.start_url as subject_url, subject_id  from userdiff_request
join userdiff_report on userdiff_report.report_id = userdiff_request.report_id
join userdiff_response on userdiff_response.request_id = userdiff_request.request_id
join subjects on subjects.id = userdiff_report.subject_id
where userdiff_report.task_id in (
    select max(id) from visit_tasks
    join visit_task_results on visit_task_results.name = visit_tasks.result_name
    where visit_task_results.success
    group by subject_id
)
order by subject_id
"""

with db.cursor() as cursor:
    cursor.execute(USERDIFF_REQUESTS)
    request_rows = cursor.fetchall()

# batch them and parallelize
from concurrent.futures import ThreadPoolExecutor


def batch(iterable, n=1):
    l = len(iterable)
    for ndx in range(0, l, n):
        yield iterable[ndx : min(ndx + n, l)]


def process_batch(batch):
    return [n_blocked(batch)]


# get the count for each subject separately
n_blocked_res = {}
unique_subjects = set([row["subject_url"] for row in request_rows])
for subject in unique_subjects:
    n_blocked_res[subject] = 0

with ThreadPoolExecutor() as executor:
    for res in executor.map(process_batch, batch(request_rows, 100)):
        for i, subject in enumerate(unique_subjects):
            n_blocked_res[subject] += res[0][subject]

n_blocked_res = pd.DataFrame(
    n_blocked_res.items(), columns=["subject_url", "n_blocked"]
)
n_blocked_res = n_blocked_res[n_blocked_res["n_blocked"] > 0]
sum_blocked = n_blocked_res["n_blocked"].sum()
print(n_blocked_res["n_blocked"].describe())
print(f"Total blocked requests: {sum_blocked}")
results["n_blocked"] = {
    "stats": n_blocked_res["n_blocked"].describe().to_dict()
    | {"sum": int(sum_blocked)},
    "data": n_blocked_res.to_dict(orient="records"),
}

fig, ax = plt.subplots()
n_blocked_res["n_blocked"].plot.hist(bins=20, ax=ax)
mean = n_blocked_res["n_blocked"].mean()
median = n_blocked_res["n_blocked"].median()
ax.axvline(mean, color="red", label=f"mean: {mean:.2f}")
ax.axvline(median, color="green", label=f"median: {median:.2f}")
ax.set_title("Number of blocked requests")
ax.set_xlabel("Number of requests")
ax.set_ylabel("Number of visits")
ax.legend()
fig.savefig(THIS_RESULTS_DIR / "n_blocked.pdf")

with open(THIS_RESULTS_DIR / f"{filename}.json", "w") as f:
    json.dump(results, f, indent=2)
