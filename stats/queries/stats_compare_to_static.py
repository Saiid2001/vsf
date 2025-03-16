from datetime import timedelta
import gzip
from common import *  # pylint: disable=import-error
import braveblock

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

def only_allowed(row, subject_url):

    return not ADBLOCKER.check_network_urls(
        row["url_path"],
        subject_url,
        request_type=''
    )

# we need to get thoe timestamps where data collection is allowed based on
#  - navigations
#  - interactions
#   allowed [ navigation, first_interaction [ ...


DELAY_TO_REPORT = timedelta(seconds=5)
MAX_INTERVAL = timedelta(seconds=30)

def static_intervals(task_id, report_id, only_first=False):

    NAVIGATION_REQUESTS = """--sql
    select userdiff_request.created_at from userdiff_request
    join userdiff_report on userdiff_report.report_id = userdiff_request.report_id
    where userdiff_report.report_id = {}
    and userdiff_request.is_navigation_request
    and userdiff_request.method = 'GET'
    """

    INTERACTIONS = """--sql
    select api_name, userdiff_interaction.created_at from userdiff_interaction
    join userdiff_frame using (frame_id)
    join userdiff_report on userdiff_frame.report_id = userdiff_report.report_id
    where userdiff_report.report_id = {}
    and api_name != 'page.goto'
    """

    intervals = []

    # print(INTERACTIONS.format(report_id))
    with db.cursor() as cursor:
        cursor.execute(INTERACTIONS.format(report_id))
        interactions = cursor.fetchall()

    with db.cursor() as cursor:
        cursor.execute(NAVIGATION_REQUESTS.format(report_id))
        navigations = cursor.fetchall()

    # merge both navigations and interactions
    interactions = [
        ("page.goto", row["created_at"]) for row in navigations
    ] + interactions
    # print(interactions)

    interactions = sorted(interactions, key=lambda x: x[1])

    # api_name could be either page.goto or frame.click or null

    for api_name, created_at in interactions:
        if api_name == "page.goto":
            intervals.append((created_at, created_at))
        else:
            if not intervals:
                intervals.append((created_at, created_at))
            else:
                intervals[-1] = (intervals[-1][0], created_at - DELAY_TO_REPORT)
                if intervals[-1][1] - intervals[-1][0] > MAX_INTERVAL:
                    intervals[-1] = (intervals[-1][0], intervals[-1][0] + MAX_INTERVAL)
                

    return intervals if not only_first else intervals[:1]


def intervals_to_sql_where(intervals, column="created_at"):

    conditions = " or ".join(
        [f"({column} between '{start}' and '{end}')" for start, end in intervals]
    )
    return conditions


def get_requests(task_id, report_id, static=False, only_first=False):

    SUBJECT = """--sql
    select domains.name from subjects
    join visit_tasks on visit_tasks.subject_id = subjects.id
    join domains on subjects.domain_id = domains.id
    where visit_tasks.id = {}
    """

    with db.cursor() as cursor:
        cursor.execute(SUBJECT.format(task_id))
        subject_domain = cursor.fetchone()
        subject_domain = subject_domain["name"]

    conditions = intervals_to_sql_where(
        static_intervals(task_id, report_id, only_first=only_first), "userdiff_request.created_at"
    )

    REQUESTS = """--sql
    select distinct method, regexp_replace(url, '\?[^/]*$', '\\1') as url_path, regexp_replace(regexp_replace(url, '^blob:', '' ), '^(?:https?://)?([^/]+).*', '\\1') as domain from userdiff_request
    join userdiff_report on userdiff_report.report_id = userdiff_request.report_id
    where userdiff_report.report_id = {}
    """ + (
        (f"and ({conditions})") if static else ""
    )

    with db.cursor() as cursor:
        cursor.execute(REQUESTS.format(report_id))
        requests = cursor.fetchall()
        

    requests = pd.DataFrame(requests, columns=["method", "url_path", "domain"])

    # drop requests that are not allowed
    requests = requests[requests.apply(lambda x: only_allowed(x, subject_domain), axis=1)]

    requests["first_party"] = requests["domain"].apply(
        lambda x: x.endswith(subject_domain)
    )
    return requests


# REPORTS = """--sql
# select report_id, task_id from userdiff_report
# where task_id in (
#     select max(id) from visit_tasks 
#     join visit_task_results on visit_task_results.name = visit_tasks.result_name
#     where visit_task_results.success
#     group by subject_id
# )
# and report_id in (
#     select distinct userdiff_frame.report_id from userdiff_frame
#     where userdiff_frame.frame_id in (
#         select distinct frame_id from userdiff_interaction
#     )
# )
# """

# REQUEST_IDS_USED_IN_SWAP_CANDIDATES = """--sql
# select distinct regexp_replace(userdiff_request.url, '\?[^/]*$','\\1') as url_path from userdiff_response
# join userdiff_request on userdiff_request.request_id = userdiff_response.request_id
# where userdiff_response.response_id in (
# 	select distinct response_1_id from analysis_candidate_pairs
# 	where task_id in (
# 		select max(id) from analysis_tasks
# 		where result_name='as'
# 		group by subject_id	
# 	)
#     and result_name='cpv'
# )
# or userdiff_response.response_id in (
# 	select distinct response_2_id from analysis_candidate_pairs
# 	where task_id in (
# 		select max(id) from analysis_tasks
# 		where result_name='as'
# 		group by subject_id	
# 	)
#     and result_name='cpv'
# )
# """

# with db.cursor() as cursor:
#     cursor.execute(REPORTS)
#     reports = cursor.fetchall()
    
# with db.cursor() as cursor:
#     cursor.execute(REQUEST_IDS_USED_IN_SWAP_CANDIDATES)
#     swap_requests = cursor.fetchall()
    
# swap_requests = set([row["url_path"] for row in swap_requests])

# intervals = []

# results = {
#     'reports': []
# }

# for report_id, task_id in reports:
    
#     report_results = {
#         'report_id': report_id,
#     }
    
#     print(f"Processing report {report_id}")

#     requests = get_requests(task_id, report_id)
#     static_requests = get_requests(task_id, report_id, static=True)
#     landing_requests = get_requests(task_id, report_id, static=True, only_first=True)

#     print(f"Requests: {len(requests)}")
#     print(f"Static Requests: {len(static_requests)}")
#     print(f"Landing Requests: {len(landing_requests)}")
    
#     report_results["requests"] = len(requests)
#     report_results["static_requests"] = len(static_requests)
#     report_results["landing_requests"] = len(landing_requests)

#     print("First party requests: ", int(requests["first_party"].sum()))
#     print("First party static requests: ", int(static_requests["first_party"].sum()))
#     print("First party landing requests: ", int(landing_requests["first_party"].sum()))
    
#     report_results["first_party_requests"] = int(requests["first_party"].sum())
#     report_results["first_party_static_requests"] = int(static_requests["first_party"].sum())
#     report_results["first_party_landing_requests"] = int(landing_requests["first_party"].sum())
    
#     METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"]
    
#     for method in METHODS:
#         print(f"Method: {method}")
#         print("Requests: ", requests[requests["method"] == method].shape[0])
#         print("Static Requests: ", static_requests[static_requests["method"] == method].shape[0])
#         print("Landing Requests: ", landing_requests[landing_requests["method"] == method].shape[0])
        
#         report_results[method] = requests[requests["method"] == method].shape[0]
#         report_results[f"static_{method}"] = static_requests[static_requests["method"] == method].shape[0]
#         report_results[f"landing_{method}"] = landing_requests[landing_requests["method"] == method].shape[0]
        
#     report_results['domains'] = int(requests["domain"].nunique())
#     report_results['static_domains'] = int(static_requests["domain"].nunique())
#     report_results['landing_domains'] = int(landing_requests["domain"].nunique())
    
#     print("Domains: ", report_results['domains'])
#     print("Static Domains: ", report_results['static_domains'])
#     print("Landing Domains: ", report_results['landing_domains'])   
    
#     # get the requests that are used in swap candidates
#     swap_requests_count = requests[requests["url_path"].isin(swap_requests)].shape[0]
#     static_swap_requests_count = static_requests[static_requests["url_path"].isin(swap_requests)].shape[0]
#     landing_swap_requests_count = landing_requests[landing_requests["url_path"].isin(swap_requests)].shape[0]
    
#     print("Swap requests: ", swap_requests_count)
#     print("Static Swap requests: ", static_swap_requests_count)
#     print("Landing Swap requests: ", landing_swap_requests_count)
    
#     report_results['swap_requests'] = swap_requests_count
#     report_results['static_swap_requests'] = static_swap_requests_count
#     report_results['landing_swap_requests'] = landing_swap_requests_count
    
#     # swap AND POST requests
#     swap_post_requests = requests[(requests["url_path"].isin(swap_requests)) & (requests["method"] == "POST")].shape[0]
#     static_swap_post_requests = static_requests[(static_requests["url_path"].isin(swap_requests)) & (static_requests["method"] == "POST")].shape[0]
#     landing_swap_post_requests = landing_requests[(landing_requests["url_path"].isin(swap_requests)) & (landing_requests["method"] == "POST")].shape[0]
    
#     print("Swap POST requests: ", swap_post_requests)
#     print("Static Swap POST requests: ", static_swap_post_requests)
#     print("Landing Swap POST requests: ", landing_swap_post_requests)
    
#     report_results['swap_POST_requests'] = swap_post_requests
#     report_results['static_swap_POST_requests'] = static_swap_post_requests
#     report_results['landing_swap_POST_requests'] = landing_swap_post_requests
    
#     results['reports'].append(report_results)
    
    
    
# with open(THIS_RESULTS_DIR / "results.json", "w") as f:
#     json.dump(results, f, indent=2)
  
results = json.load(open(THIS_RESULTS_DIR / "results.json"))

stats_df = pd.DataFrame(results['reports'])

# remove outliers
stats_df = stats_df[stats_df["domains"] < 200]
stats_df = stats_df[stats_df["POST"] < 120]


# box plots for total requests, first party, GET, POST, and domains
fig, axes = plt.subplots(2, 3, figsize=(15,10))

BOX_PLOT_PROPS = dict(
    return_type='dict',
    showmeans=True, meanline=True, showfliers=True, showbox=True, boxprops={
    'linewidth': 4, 
    "color": "black",
}, 
widths=0.4,
patch_artist=True,
whiskerprops={
    'linewidth': 4,
    "color": "black",
},
medianprops={
    'linewidth': 2,
    "color": "black",
},
capprops={
    'linewidth': 4,
    "color": "black",
},  
meanprops={
    'linewidth': 2,
    "color": "#DF5536",
},

)

def change_boxplot_patch_color(bp):
    plt.setp(bp['boxes'], facecolor=(0.31, 0.60, 0.91, 0.4))

# totals    
change_boxplot_patch_color(stats_df.boxplot(column=["requests", "static_requests"], ax=axes[0][0], **BOX_PLOT_PROPS))
axes[0][0].set_title("All Requests")
axes[0][0].set_xticklabels(["VSF", "Static"])

# first party
change_boxplot_patch_color(stats_df.boxplot(column=["first_party_requests", "first_party_static_requests"], ax=axes[0][1], **BOX_PLOT_PROPS))
axes[0][1].set_title("First Party Requests")
axes[0][1].set_xticklabels(["VSF", "Static"])

# GET
change_boxplot_patch_color(stats_df.boxplot(column=["GET", "static_GET"], ax=axes[0][2], **BOX_PLOT_PROPS))
axes[0][2].set_title("GET Requests")
axes[0][2].set_xticklabels(["VSF", "Static"])

# POST
change_boxplot_patch_color(stats_df.boxplot(column=["POST", "static_POST"], ax=axes[1][0], **BOX_PLOT_PROPS))
axes[1][0].set_title("POST Requests")
axes[1][0].set_xticklabels(["VSF", "Static"])

# domains
change_boxplot_patch_color(stats_df.boxplot(column=["domains", "static_domains"], ax=axes[1][1], **BOX_PLOT_PROPS))
axes[1][1].set_title("Domains")
axes[1][1].set_xticklabels(["VSF", "Static"])

# swap requests
# _stats_df = stats_df[stats_df["swap_requests"] > 0]
_stats_df = stats_df[stats_df["swap_requests"] > 0]

change_boxplot_patch_color(_stats_df.boxplot(column=["swap_requests", "static_swap_requests"], ax=axes[1][2], ** BOX_PLOT_PROPS | {"showfliers": False}))
axes[1][2].set_title("Probing Requests")
axes[1][2].set_xticklabels(["VSF", "Static"])

# make log scale
for row in axes:
    for ax in row:
        # ax.set_yscale("log")
        
        # remove y axis line
        ax.spines['left'].set_visible(False)

fig.tight_layout()

fig.savefig(THIS_RESULTS_DIR / "compare_to_static_boxplots.pdf")


print("Total number of requests: ", stats_df["requests"].sum())
print("Total number of static requests: ", stats_df["static_requests"].sum())
print("Total number of first party requests: ", stats_df["first_party_requests"].sum())
print("Total number of static first party requests: ", stats_df["first_party_static_requests"].sum())
print("Total number of GET requests: ", stats_df["GET"].sum())
print("Total number of static GET requests: ", stats_df["static_GET"].sum())
print("Total number of POST requests: ", stats_df["POST"].sum())
print("Total number of static POST requests: ", stats_df["static_POST"].sum())
print("Total number of domains: ", stats_df["domains"].sum())
print("Total number of static domains: ", stats_df["static_domains"].sum())
print("Total number of swapping requests: ", stats_df["swap_requests"].sum())
print("Total number of static swapping requests: ", stats_df["static_swap_requests"].sum())
print("Total number of swapping POST requests: ", stats_df["swap_POST_requests"].sum())

results["stats"] = {
    "sum": {
        "requests": stats_df["requests"].sum(),
        "static_requests": stats_df["static_requests"].sum(),
        "first_party_requests": stats_df["first_party_requests"].sum(),
        "first_party_static_requests": stats_df["first_party_static_requests"].sum(),
        "GET": stats_df["GET"].sum(),
        "static_GET": stats_df["static_GET"].sum(),
        "POST": stats_df["POST"].sum(),
        "static_POST": stats_df["static_POST"].sum(),
        "domains": stats_df["domains"].sum(),
        "static_domains": stats_df["static_domains"].sum(),
        "swap_requests": stats_df["swap_requests"].sum(),
        "static_swap_requests": stats_df["static_swap_requests"].sum(),
        "swap_POST_requests": stats_df["swap_POST_requests"].sum(),
    },
    "mean": {
        "requests": stats_df["requests"].mean(),
        "static_requests": stats_df["static_requests"].mean(),
        "first_party_requests": stats_df["first_party_requests"].mean(),
        "first_party_static_requests": stats_df["first_party_static_requests"].mean(),
        "GET": stats_df["GET"].mean(),
        "static_GET": stats_df["static_GET"].mean(),
        "POST": stats_df["POST"].mean(),
        "static_POST": stats_df["static_POST"].mean(),
        "domains": stats_df["domains"].mean(),
        "static_domains": stats_df["static_domains"].mean(),
        "swap_requests": stats_df["swap_requests"].mean(),
        "static_swap_requests": stats_df["static_swap_requests"].mean(),
        "swap_POST_requests": stats_df["swap_POST_requests"].mean(),
    },
    "std": {
        "requests": stats_df["requests"].std(),
        "static_requests": stats_df["static_requests"].std(),
        "first_party_requests": stats_df["first_party_requests"].std(),
        "first_party_static_requests": stats_df["first_party_static_requests"].std(),
        "GET": stats_df["GET"].std(),
        "static_GET": stats_df["static_GET"].std(),
        "POST": stats_df["POST"].std(),
        "static_POST": stats_df["static_POST"].std(),
        "domains": stats_df["domains"].std(),
        "static_domains": stats_df["static_domains"].std(),
        "swap_requests": stats_df["swap_requests"].std(),
        "static_swap_requests": stats_df["static_swap_requests"].std(),
        "swap_POST_requests": stats_df["swap_POST_requests"].std(),
    },
    "median": {
        "requests": stats_df["requests"].median(),
        "static_requests": stats_df["static_requests"].median(),
        "first_party_requests": stats_df["first_party_requests"].median(),
        "first_party_static_requests": stats_df["first_party_static_requests"].median(),
        "GET": stats_df["GET"].median(),
        "static_GET": stats_df["static_GET"].median(),
        "POST": stats_df["POST"].median(),
        "static_POST": stats_df["static_POST"].median(),
        "domains": stats_df["domains"].median(),
        "static_domains": stats_df["static_domains"].median(),
        "swap_requests": stats_df["swap_requests"].median(),
        "static_swap_requests": stats_df["static_swap_requests"].median(),
        "swap_POST_requests": stats_df["swap_POST_requests"].median(),
    },
}

#  make values serializable
for key in results["stats"]:
    for k in results["stats"][key]:
        
        # if numpy int
        if isinstance(results["stats"][key][k], np.int64):
            results["stats"][key][k] = int(results["stats"][key][k])
        else:
            results["stats"][key][k] = float(results["stats"][key][k])

with open(THIS_RESULTS_DIR / "results.json", "w") as f:
    json.dump(results, f, indent=2)
    