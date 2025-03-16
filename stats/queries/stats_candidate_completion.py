from common import *  # pylint: disable=import-error

__dir__ = Path(__file__).parent
filename = __file__.split("/")[-1].replace(".py", "")
THIS_RESULTS_DIR = RESULTS_DIR / filename
THIS_RESULTS_DIR.mkdir(parents=True, exist_ok=True)

results = {}


INTERESTING_CANDIDATES = []

with open(__dir__ / "interesting_candidates.txt", "r") as f:
    for line in f:
        INTERESTING_CANDIDATES.append(int(line.strip()))


TEMPLATES_QUERY = """--sql

select id, task_id, swap_request_representation #>> '{template, url_path, template}' as url_template from swap_candidate_pairs

where task_id in (
	select max(id) from swap_tasks
	where note not like '%dispos%'
	group by subject_id
)

and state='finished';

"""

with db.cursor() as cursor:
    cursor.execute(TEMPLATES_QUERY)
    templates = cursor.fetchall()
    
templates = pd.DataFrame(templates, columns=["candidate_id", "task_id", "url_template"])

interesting_templates = templates[ templates.apply(lambda x: x.candidate_id in INTERESTING_CANDIDATES, axis=1) ]
non_interesting_templates = templates[ ~templates.apply(lambda x: x.url_template in interesting_templates["url_template"].values, axis=1) ]

print(f"Interesting templates: {len(interesting_templates)}")
print(f"Non-interesting templates: {len(non_interesting_templates)}")

results["templates"] = {
    "interesting": len(interesting_templates),
    "non_interesting": len(non_interesting_templates)
}

# unique templates
print(f"Unique templates: {len(templates['url_template'].unique())}")
print(f"Unique interesting templates: {len(interesting_templates['url_template'].unique())}")
print(f"Unique non-interesting templates: {len(non_interesting_templates['url_template'].unique())}")

# save csv file of url_template, max(candidate_id)
non_interesting_candidates = non_interesting_templates.groupby(["url_template", "task_id"]).agg({"candidate_id": "max"}).reset_index()

non_interesting_candidates['candidate_url'] = non_interesting_candidates.apply(lambda x: f"https://localhost:3000/tasks/{x.task_id}/candidates/{x.candidate_id}", axis=1)
non_interesting_candidates.to_csv(THIS_RESULTS_DIR / "non_interesting_candidates.csv", index=False)

# candidates that are actually apis
print(f"API candidates: {len(templates[templates['request_nature'].str.contains('api')])}")