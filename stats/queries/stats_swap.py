from common import * #pylint: disable=import-error

filename = __file__.split("/")[-1].replace(".py", "")
THIS_RESULTS_DIR = RESULTS_DIR / filename
THIS_RESULTS_DIR.mkdir(parents=True, exist_ok=True)

results = {}

TOTAL_SWAP_CANDIDATES = """--sql
select subject_id, count(swap_candidate_pairs.id) from swap_candidate_pairs
join swap_tasks on swap_tasks.id = swap_candidate_pairs.task_id
and swap_tasks.id in (
    select max(id) from swap_tasks
    where swap_tasks.note not like '%dispos%'
    and swap_tasks.result_name='scs'
    group by subject_id
)
group by subject_id
"""

with db.cursor() as cursor:
    cursor.execute(TOTAL_SWAP_CANDIDATES)
    total_swap_candidates = cursor.fetchall()
    
total_swap_candidates = pd.DataFrame(total_swap_candidates, columns=["subject_id", "total_swap_candidates"])
total_swap_candidates = total_swap_candidates[total_swap_candidates["total_swap_candidates"] > 0]
sum_swap_candidates = total_swap_candidates["total_swap_candidates"].sum()
print(total_swap_candidates["total_swap_candidates"].describe())
print(f"Total swap candidates: {sum_swap_candidates}")
results["total_swap_candidates"] = {
    
    'stats': total_swap_candidates["total_swap_candidates"].describe().to_dict() | {'sum': int(sum_swap_candidates)},
    'data': total_swap_candidates.to_dict(orient="records")
}

fig, ax = plt.subplots()
total_swap_candidates["total_swap_candidates"].plot.hist(bins=20, ax=ax)
mean = total_swap_candidates["total_swap_candidates"].mean()
median = total_swap_candidates["total_swap_candidates"].median()
ax.axvline(mean, color="red", label=f"mean: {mean:.2f}")
ax.axvline(median, color="green", label=f"median: {median:.2f}")
ax.set_title("Number of swap candidates")
ax.set_xlabel("Number of candidates")
ax.set_ylabel("Number of visits")
ax.legend()
fig.savefig(THIS_RESULTS_DIR / "total_swap_candidates.pdf")

# Only successful swaps
TOTAL_SUCCESSFUL_SWAPS = """--sql
select subject_id, count(swap_candidate_pairs.id) from swap_candidate_pairs
join swap_tasks on swap_tasks.id = swap_candidate_pairs.task_id
and swap_tasks.id in (
    select max(id) from swap_tasks
    where swap_tasks.note not like '%dispos%'
    and swap_tasks.result_name='scs'
    group by subject_id
)
where swap_candidate_pairs.state='finished'
group by subject_id
"""

with db.cursor() as cursor:
    cursor.execute(TOTAL_SUCCESSFUL_SWAPS)
    total_successful_swaps = cursor.fetchall()
    
total_successful_swaps = pd.DataFrame(total_successful_swaps, columns=["subject_id", "total_successful_swaps"])
total_successful_swaps = total_successful_swaps[total_successful_swaps["total_successful_swaps"] > 0]
sum_successful_swaps = total_successful_swaps["total_successful_swaps"].sum()
print(total_successful_swaps["total_successful_swaps"].describe())
print(f"Total successful swaps: {sum_successful_swaps}")
results["total_successful_swaps"] = {
    'stats': total_successful_swaps["total_successful_swaps"].describe().to_dict() | {'sum': int(sum_successful_swaps)},
    'data': total_successful_swaps.to_dict(orient="records")
}

fig, ax = plt.subplots()
total_successful_swaps["total_successful_swaps"].plot.hist(bins=20, ax=ax)
mean = total_successful_swaps["total_successful_swaps"].mean()
median = total_successful_swaps["total_successful_swaps"].median()
ax.axvline(mean, color="red", label=f"mean: {mean:.2f}")
ax.axvline(median, color="green", label=f"median: {median:.2f}")
ax.set_title("Number of successful swaps")
ax.set_xlabel("Number of swaps")
ax.set_ylabel("Number of visits")
ax.legend()

fig.savefig(THIS_RESULTS_DIR / "total_successful_swaps.pdf")


# UNIQUE SWAP CANDIDATE URLs

UNIQUE_SWAP_URL = """--sql
select distinct swap_request_representation #>> '{template, url_path, template}' from swap_candidate_pairs

where task_id in (
	select max(id) from swap_tasks
	where note not like '%dispos%'
	group by subject_id
)

and state='finished';
"""

with db.cursor() as cursor:
    cursor.execute(UNIQUE_SWAP_URL)
    unique_swap_urls = cursor.fetchall()

unique_swap_urls = pd.DataFrame(unique_swap_urls, columns=["url"])
unique_swap_urls = unique_swap_urls["url"].value_counts().reset_index()
unique_swap_urls.columns = ["url", "count"]
unique_swap_urls = unique_swap_urls.sort_values("count", ascending=False)
print(unique_swap_urls.head(10))
results["unique_swap_urls"] = {
    "count": unique_swap_urls.shape[0],
}


with open(THIS_RESULTS_DIR / "stats_swap.json", "w") as f:
    json.dump(results, f, indent=4)
    