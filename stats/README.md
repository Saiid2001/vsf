# Paper statistics

This directory reproduces the numbers and plots reported in the paper. Each script in `queries/` reads from the two Postgres databases populated by the framework (the VSF crawler DB and the Account Framework DB) and writes its outputs to `results/<script_name>/`.

## Layout

- `config.py` — loads DB connection settings from environment variables.
- `db.py` — opens the `psycopg2` connections used by every query.
- `queries/common.py` — shared plotting style and results directory.
- `queries/stats_*.py` — one script per section/figure of the paper (e.g. `stats_sites.py`, `stats_swap.py`, `stats_apis.py`).
- `queries/interesting_candidates.txt`, `queries/manual_analysis.csv` — manually curated inputs referenced by some scripts.

## Prerequisites

- Python 3.10+.
- The two databases produced by the framework: the VSF crawler DB (`userdiff_manual___...`) and the Account Framework DB. Both must be reachable from the machine running these scripts. See [`../docs/MIRRORING.md`](../docs/MIRRORING.md) for how to produce them.
- Python packages: `psycopg2-binary`, `python-dotenv`, `pandas`, `numpy`, `matplotlib`.

```bash
pip install psycopg2-binary python-dotenv pandas numpy matplotlib
```

## Configuration

Create a `.env` file in this directory (or export the variables in your shell):

```bash
# VSF crawler DB
DB_HOST=127.0.0.1
DB_PORT=55434
DB_PASSWORD=<contents of framework/crawler/secrets/db_password.txt>
DB_NAME=userdiff_manual___YYYY_MM_DD_HH_MM_SS

# Account Framework DB
ACCF_DB_HOST=127.0.0.1
ACCF_DB_PORT=55432
ACCF_DB_PASSWORD=<AccountFramework DB password>
ACCF_DB_NAME=accf
```

`DB_USER` and `ACCF_DB_USER` are hard-coded to `postgres` in `config.py`.

## Running a query

```bash
cd stats
python -m queries.stats_sites
```

Outputs (JSON results, CSVs, PDF/PNG plots) are written under `stats/results/stats_sites/`.

## Reproducing the paper

The paper's dataset (crawler DB dumps + Account Framework DB dumps from our May–June 2024 crawl) is not distributed with this repo. If you re-run the framework on your own target list you can regenerate every table and figure by executing the scripts in `queries/` against your own DBs; the SQL is data-agnostic. To obtain the exact datasets used in the paper, contact the authors (see the root `README.md`).
