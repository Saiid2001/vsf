from common import * #pylint: disable=import-error

filename = __file__.split("/")[-1].replace(".py", "")
THIS_RESULTS_DIR = RESULTS_DIR / filename
THIS_RESULTS_DIR.mkdir(parents=True, exist_ok=True)


UNIQUE_APIS = """--sql
    select distinct subject_id, method url from userdiff_request
    join userdiff_report on userdiff_report.report_id = userdiff_request.report_id
    where userdiff_report.task_id in (
        select max(id) from visit_tasks group by subject_id
    );
"""


def get_url_path(url):
    return url.split("?")[0].split("#")[0]


with db.cursor() as cur:
    cur.execute(UNIQUE_APIS)
    results = cur.fetchall()

    df = pd.DataFrame(results, columns=["subject_id", "method", "url"])
    
    df["path"] = df["url"].apply(get_url_path)
    
    # n unique paths per subject bar chart
    fig, ax = plt.subplots()
    n_unique_paths = df.groupby("subject_id")["path"].nunique()
    # sort by number of unique paths
    n_unique_paths = n_unique_paths.sort_values(ascending=False)
    n_unique_paths.plot(kind="bar", ax=ax)
    ax.set_xlabel("Subject ID")
    ax.set_ylabel("Number of unique paths")
    ax.set_title("Number of unique paths per subject")
    ax.set_yscale("log")
    fig.savefig(THIS_RESULTS_DIR / "unique_paths_per_subject.pdf")
    
    # n unique paths distribution
    fig, ax = plt.subplots()
    n_unique_paths.hist(bins=50, ax=ax)
    median = n_unique_paths.median()
    ax.axvline(median, color="red", linestyle="--")
    ax.text(median, 100, f"Median: {median}", rotation=90)
    ax.set_xlabel("Number of unique paths")
    ax.set_ylabel("Number of subjects")
    ax.set_title("Distribution of unique paths per subject")
    fig.savefig(THIS_RESULTS_DIR / "unique_paths_distribution.pdf")
    
    
    