import os
import subprocess
import argparse
import multiprocessing
from multiprocessing.pool import Pool
import datetime
from typing import Optional
import time
from typing_extensions import Type
import sys
import traceback

import functools

print = functools.partial(print, flush=True)
_print = print


__dir__ = os.path.dirname(os.path.abspath(__file__))

def print(*args, **kw):
    _print("[%s]" % (datetime.datetime.now()), *args, **kw)


class Tee(object):
    """Helper for better logging (to a file)."""
    def __init__(self, filename, name):
        self.file = open(f"{filename}", "a")
        self.stdout = sys.stdout
        self.name = name

    def __enter__(self):
        sys.stdout = self
        return self.file

    def __exit__(self, exc_type, exc_value, tb):
        sys.stdout = self.stdout
        if exc_type is not None:
            self.file.write(traceback.format_exc())
        self.file.close()

    def write(self, data):
        if data != "\n" and data != " " and data != "":
            data = f"{self.name}: {data}"
        self.file.write(data)
        self.stdout.write(data)

    def flush(self):
        self.file.flush()
        self.stdout.flush()


parser = argparse.ArgumentParser()
parser.add_argument("--num_workers", type=int, default=20)
parser.add_argument("--datapath", type=str)
parser.add_argument("--logpath", type=str)
parser.add_argument("--dbname", type=str)
parser.add_argument("--dbuser", type=str)
parser.add_argument("--dbpwd", type=str)
parser.add_argument("--dbhost", type=str)

def get_task(table: "Type[db.Task]") -> Optional["db.Task"]:
    """Try to select a free task."""
    # Atomic transaction
    with db.db.atomic():
        subquery = (
            table.select(table.id)
            .where((table.status_name == "free") & (table.task_type == "auto"))
            .limit(1)
            .for_update()
        )
        tasks = (
            table.update(status_name="selected", actor="auto")
            .where(table.id.in_(subquery))
            .returning(table)
            .execute()
        )

    return tasks[0] if len(tasks) > 0 else None


def complete_task(task: "db.Task", task_status: str):
    
    if task._meta.table_name == db.PreanalysisTask._meta.table_name:
    
        status_to_result = {
            "completed": "pas",
            "failed": "pae",
            "timeout": "pae",
        }
        
    elif task._meta.table_name == db.AnalysisTask._meta.table_name:
        status_to_result = {
            "completed": "as",
            "failed": "ae",
            "timeout": "ae"
        }
    
    else:
        raise NotImplementedError(f"Task type {task._meta.table_name} not implemented.")    
    
    task.status_name = "completed"
    task.result_name = status_to_result[task_status]
    task.note = task_status
    task.save()
    print(f"{task._meta.table_name}-{task}: {task_status}")

LOG_BASE: str
DATA_BASE: str

# one hour timeout
def run_task(task_id: "db.Task", task_type: str, task_timeout: int = 3600): 
    """Start the work_auto.py script on a task."""
    process_number = multiprocessing.current_process().name.split("-")[1]
    with Tee(f"{LOG_BASE}/analysis_0_main.log", f"worker-{process_number}"):
        with open(f"{LOG_BASE}/analysis_auto_{process_number}.log", "a") as f:
            try:
                subprocess.run(
                    ["python3", f"{__dir__}/work_auto.py", str(task_id), task_type, DATA_BASE ],
                    stdout=f,
                    stderr=f,
                    timeout=task_timeout,
                    check=True,
                )
            except subprocess.TimeoutExpired:
                # Log task as timeout
                task_status = "timeout"
                complete_task(task_id, task_status)
            except subprocess.CalledProcessError:
                # Log task as failed 
                # TODO: Continue fixing here by changing all non-complete status to result_name
                task_status = "failed"
                complete_task(task_id, task_status)
            except Exception as e:
                print(
                    f"{task_id._meta.table_name}-{task_id}: Unexpected exception: {e}!"
                )


def main(num_workers: int):
    """Loop foreven and start auto tasks if available."""
    p = Pool(processes=num_workers)
    # Main loop
    print_sleep = True
    print(f"Start analysis run_auto with {num_workers} workers.")
    with Tee(f"{LOG_BASE}/analysis_0_main.log", "main"):
        while True:
            # Iterate through tables in order of priority
            for table, task_type in [
                (db.PreanalysisTask, "preanalysis"),
                (db.AnalysisTask, "analysis"),
            ]:
                # Try to get task
                task: Optional["db.Task"] = get_task(table)
                # Try the other task type if possible
                if task is None:
                    continue
                p.apply_async(run_task, [task, task_type])
                # Break to start from scratch again
                print_sleep = True
                break
            else:
                # No task was found, wait a bit for tasks to come available
                if print_sleep:
                    print("No Task found sleeping")
                    print_sleep = False
                time.sleep(60)


if __name__ == "__main__":
    args = parser.parse_args()
    
    # make the params as environment variables
    os.environ["POSTGRES_HOST"] = args.dbhost
    os.environ["POSTGRES_PORT"] = "5432"
    os.environ["POSTGRES_DB"] = args.dbname
    os.environ["POSTGRES_USER"] = args.dbuser
    os.environ["POSTGRES_PASSWORD"] = args.dbpwd
    DATA_BASE = args.datapath
    LOG_BASE = args.logpath
    
    import db
    
    main(args.num_workers)
