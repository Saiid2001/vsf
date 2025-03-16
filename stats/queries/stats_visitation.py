from common import * #pylint: disable=import-error

filename = __file__.split("/")[-1].replace(".py", "")
THIS_RESULTS_DIR = RESULTS_DIR / filename

THIS_RESULTS_DIR.mkdir(parents=True, exist_ok=True)

results = {}

# VISITATION DURATION

VISITATION_DURATIONS = """--sql
select id, visitation_begin, visitation_end from subjects
where id in (
    select subject_id from visit_tasks
    join visit_task_results on visit_task_results.name = visit_tasks.result_name
    where visit_task_results.success
)
"""

with db.cursor() as cursor:
    cursor.execute(VISITATION_DURATIONS)
    durations = cursor.fetchall()
    
durations = pd.DataFrame(durations, columns=["id", "visitation_begin", "visitation_end"])
durations["duration"] = durations["visitation_end"] - durations["visitation_begin"]
durations["duration"] = durations["duration"].dt.total_seconds()
durations["duration"] = durations["duration"] / 60
durations = durations[durations["duration"] > 0]
# anything above 20 minutes is an outlier
durations = durations[durations["duration"] < 20]

print(durations["duration"].describe())
results["visitation_duration"] = durations["duration"].describe().to_dict()

fig, ax = plt.subplots()
durations["duration"].plot.hist(bins=10, ax=ax)
mean = durations["duration"].mean()
median = durations["duration"].median()
ax.axvline(mean, color="red", label=f"mean: {mean:.2f}")
ax.axvline(median, color="green", label=f"median: {median:.2f}")
ax.set_title("Visitation duration")
ax.set_xlabel("Duration (minutes)")
ax.set_ylabel("Number of visits")
ax.legend() 
fig.savefig(THIS_RESULTS_DIR / "visitation_duration.pdf")


# Number of unique URLs navigated

NAVIGATED_URLS = """--sql
select subject_id, count(distinct regexp_replace(url, '\\?[^/]*$', '\\1')) from userdiff_request
join userdiff_report on userdiff_report.report_id = userdiff_request.report_id
join subjects on subjects.id = userdiff_report.subject_id
join domains on domains.id = subjects.domain_id
where userdiff_request.is_navigation_request
and regexp_replace(url, '^(?:https?://)?([^/]+).*', '\\1')  like '%' || domains.name
group by subject_id
"""

with db.cursor() as cursor:
    cursor.execute(NAVIGATED_URLS)
    navigated_urls = cursor.fetchall()
    
navigated_urls = pd.DataFrame(navigated_urls, columns=["subject_id", "count"])
navigated_urls = navigated_urls[navigated_urls["count"] > 0]
print(navigated_urls["count"].describe())
results["navigated_urls"] ={
    'stats': navigated_urls["count"].describe().to_dict(),
    'data': navigated_urls.to_dict(orient="records")
}

fig, ax = plt.subplots()
navigated_urls["count"].plot.hist(bins=20, ax=ax)
mean = navigated_urls["count"].mean()
median = navigated_urls["count"].median()
ax.axvline(mean, color="red", label=f"mean: {mean:.2f}")
ax.axvline(median, color="green", label=f"median: {median:.2f}")
ax.set_title("Number of unique URLs navigated")
ax.set_xlabel("Number of URLs")
ax.set_ylabel("Number of visits")
ax.legend()
fig.savefig(THIS_RESULTS_DIR / "navigated_urls.pdf")


# Number of unique interactions

INTERACTIONS = """--sql
select subject_id, count(distinct userdiff_interaction.params #>> '{}') from userdiff_interaction
join userdiff_frame on userdiff_frame.frame_id = userdiff_interaction.frame_id
join userdiff_report on userdiff_report.report_id = userdiff_frame.report_id
where userdiff_report.task_id in (
    select max(id) from visit_tasks 
    join visit_task_results on visit_task_results.name = visit_tasks.result_name
    where visit_task_results.success
    group by subject_id
)
group by subject_id
"""

with db.cursor() as cursor:
    cursor.execute(INTERACTIONS)
    interactions = cursor.fetchall()
    
interactions = pd.DataFrame(interactions, columns=["subject_id", "count"])  
interactions = interactions[interactions["count"] > 0]
print(interactions["count"].describe())
results["interactions"] = {
    'stats': interactions["count"].describe().to_dict(),
    'data': interactions.to_dict(orient="records")
}

fig, ax = plt.subplots()
interactions["count"].plot.hist(bins=20, ax=ax)
mean = interactions["count"].mean()
median = interactions["count"].median()
ax.axvline(mean, color="red", label=f"mean: {mean:.2f}")
ax.axvline(median, color="green", label=f"median: {median:.2f}")
ax.set_title("Number of unique interactions")
ax.set_xlabel("Number of interactions")
ax.set_ylabel("Number of visits")
ax.legend()
fig.savefig(THIS_RESULTS_DIR / "interactions.pdf")


# unique hostnames contacted

HOSTNAMES = """--sql
select subject_id, count(distinct regexp_replace(url, '^(?:https?://)?([^/]+).*', '\\1'))  from userdiff_request
join userdiff_report on userdiff_report.report_id = userdiff_request.report_id
join subjects on subjects.id = userdiff_report.subject_id
join domains on domains.id = subjects.domain_id
where userdiff_request.is_navigation_request
-- and regexp_replace(url, '^(?:https?://)?([^/]+).*', '\\1')  like '%' || domains.name
group by subject_id;
"""

with db.cursor() as cursor:
    cursor.execute(HOSTNAMES)
    hostnames = cursor.fetchall()
    
hostnames = pd.DataFrame(hostnames, columns=["subject_id", "count"])
hostnames = hostnames[hostnames["count"] > 0]
print(hostnames["count"].describe())
results["hostnames"] = {
    'stats': hostnames["count"].describe().to_dict(),
    'data': hostnames.to_dict(orient="records")
}

fig, ax = plt.subplots()
hostnames["count"].plot.hist(bins=50, ax=ax, logy=True)
mean = hostnames["count"].mean()
median = hostnames["count"].median()
ax.axvline(mean, color="red", label=f"mean: {mean:.2f}")
ax.axvline(median, color="green", label=f"median: {median:.2f}")
ax.set_title("Number of unique hostnames contacted")
ax.set_xlabel("Number of hostnames")
ax.set_ylabel("Number of visits")
ax.legend()
fig.tight_layout()
fig.savefig(THIS_RESULTS_DIR / "hostnames.pdf")


with open(THIS_RESULTS_DIR / "stats_visitation.json", "w") as f:
    json.dump(results, f, indent=4)
    
