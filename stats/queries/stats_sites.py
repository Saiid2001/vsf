from common import * #pylint: disable=import-error

filename = __file__.split("/")[-1].replace(".py", "")
THIS_RESULTS_DIR = RESULTS_DIR / filename
THIS_RESULTS_DIR.mkdir(parents=True, exist_ok=True)

results = {}

TOTAL_WEBSITES = """--sql
select count(distinct site) from aa_task
"""

TOTAL_WEBSITES_WITH_LOGIN_AND_REGISTER = """--sql
select count(distinct website_id) from register_tasks
"""

TOTAL_WEBSITES_WITH_TWO_ACCOUNTS = """--sql
select count(distinct start_url) from subjects
"""

TOTAL_SUCCESSFUL_VISITS = """--sql
select count(distinct subject_id) from visit_tasks
join visit_task_results on visit_task_results.name = visit_tasks.result_name
where visit_task_results.success
and visit_tasks.note not like '%dispos%'
"""

TOTAL_SUCCESSFUL_SWAPPED = """--sql
select count(distinct subject_id) from swap_tasks
join swap_task_results on swap_task_results.name = swap_tasks.result_name
where swap_task_results.success
and swap_tasks.note not like '%dispos%'
"""

with accf_db.cursor() as cursor:
    cursor.execute(TOTAL_WEBSITES)
    total_websites = cursor.fetchone()[0]
    
    
results["total_websites"] = total_websites
print(f"Total websites: {total_websites}")


with accf_db.cursor() as cursor:
    cursor.execute(TOTAL_WEBSITES_WITH_LOGIN_AND_REGISTER)
    total_websites_with_login_and_register = cursor.fetchone()[0]
    
results["total_websites_with_login_and_register"] = total_websites_with_login_and_register
print(f"Total websites with login and register: {total_websites_with_login_and_register}")

with db.cursor() as cursor:
    cursor.execute(TOTAL_WEBSITES_WITH_TWO_ACCOUNTS)
    total_websites_with_two_accounts = cursor.fetchone()[0]
    
results["total_websites_with_two_accounts"] = total_websites_with_two_accounts
print(f"Total websites with two accounts: {total_websites_with_two_accounts}")

with db.cursor() as cursor: 
    cursor.execute(TOTAL_SUCCESSFUL_VISITS)
    total_successful_visits = cursor.fetchone()[0]
    
results["total_successful_visits"] = total_successful_visits
print(f"Total successful visits: {total_successful_visits}")

with db.cursor() as cursor:
    cursor.execute(TOTAL_SUCCESSFUL_SWAPPED)
    total_successful_swapped = cursor.fetchone()[0]
    
results["total_successful_swapped"] = total_successful_swapped
print(f"Total successful swapped: {total_successful_swapped}")

with open(THIS_RESULTS_DIR / "stats_sites.json", "w") as f:
    json.dump(results, f, indent=2)
    
    
