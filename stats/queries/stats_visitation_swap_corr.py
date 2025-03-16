from common import * #pylint: disable=import-error

filename = __file__.split("/")[-1].replace(".py", "")
THIS_RESULTS_DIR = RESULTS_DIR / filename
THIS_RESULTS_DIR.mkdir(parents=True, exist_ok=True)

results = {}

UNIQUE_API_TO_SWAP = """--sql
select subject_id, count(distinct regexp_replace(userdiff_request.url, '\?[^/]*$', '\\1')) from userdiff_response
join userdiff_request on userdiff_request.request_id = userdiff_response.request_id
join userdiff_report on userdiff_report.report_id = userdiff_request.report_id
where userdiff_response.response_id in (
    select distinct response_1_id from analysis_candidate_pairs
    where task_id in (
        select max(id) from analysis_tasks
        where result_name='as'
        group by subject_id	
    )
    and result_name='cpv'
)
group by subject_id
"""

with db.cursor() as cursor:
    cursor.execute(UNIQUE_API_TO_SWAP)
    unique_api_to_swap = cursor.fetchall()
    
unique_api_to_swap = pd.DataFrame(unique_api_to_swap, columns=["subject_id", "unique_api_to_swap"])
unique_api_to_swap = unique_api_to_swap[unique_api_to_swap["unique_api_to_swap"] > 0]
print(unique_api_to_swap["unique_api_to_swap"].describe())
results["unique_api_to_swap"] = {
    'stats': unique_api_to_swap["unique_api_to_swap"].describe().to_dict(),
    'data': unique_api_to_swap.to_dict(orient="records")
}

fig, ax = plt.subplots()
unique_api_to_swap["unique_api_to_swap"].plot.hist(bins=20, ax=ax)
mean = unique_api_to_swap["unique_api_to_swap"].mean()
median = unique_api_to_swap["unique_api_to_swap"].median()
ax.axvline(mean, color="red", label=f"mean: {mean:.2f}")
ax.axvline(median, color="green", label=f"median: {median:.2f}")
ax.set_title("Number of unique API requests to swap")
ax.set_xlabel("Number of requests")
ax.set_ylabel("Number of visits")
ax.legend()
fig.savefig(THIS_RESULTS_DIR / "unique_api_to_swap.pdf")


# get from other stats
visitation_stats = json.load(open(RESULTS_DIR / "stats_visitation/stats_visitation.json"))

# Number of unique URLs navigated
navigated_urls = pd.DataFrame(visitation_stats["navigated_urls"]["data"]).rename(columns={ "count": "count_navigated_urls"})
interactions = pd.DataFrame(visitation_stats["interactions"]["data"]).rename(columns={ "count": "count_interactions"})


df = navigated_urls.merge(interactions, on="subject_id")
df = df.merge(unique_api_to_swap, on="subject_id")

# Plot number of unique URLs vs number of unique swaps
fig, ax = plt.subplots()
df.plot.scatter(x="count_navigated_urls", y="unique_api_to_swap", ax=ax)
ax.set_xlabel("Number of unique URLs navigated")
ax.set_ylabel("Number of unique API requests to swap")
ax.set_title("Number of unique URLs navigated vs number of unique API requests to swap")
fig.savefig(THIS_RESULTS_DIR / "unique_urls_vs_unique_swaps.pdf")

# Plot number of unique interactions vs number of unique swaps
fig, ax = plt.subplots()
df.plot.scatter(x="count_interactions", y="unique_api_to_swap", ax=ax)
ax.set_xlabel("Number of unique interactions")
ax.set_ylabel("Number of unique API requests to swap")
ax.set_title("Number of unique interactions vs number of unique API requests to swap")
fig.savefig(THIS_RESULTS_DIR / "unique_interactions_vs_unique_swaps.pdf")

with open(THIS_RESULTS_DIR / "stats_visitation_swap_corr.json", "w") as f:
    json.dump(results, f, indent=2)
