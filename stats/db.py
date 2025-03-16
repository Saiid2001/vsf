import datetime
import gzip
import json
import config as stats_config
import psycopg2
from pathlib import Path
from psycopg2.extras import DictCursor

db = psycopg2.connect(
    database=stats_config.DB_NAME,
    user=stats_config.DB_USER,
    password=stats_config.DB_PASSWORD,
    host=stats_config.DB_HOST,
    port=stats_config.DB_PORT,
    cursor_factory=DictCursor
)

accf_db = psycopg2.connect(
    database=stats_config.ACCF_DB_NAME,
    user=stats_config.ACCF_DB_USER,
    password=stats_config.ACCF_DB_PASSWORD,
    host=stats_config.ACCF_DB_HOST,
    port=stats_config.ACCF_DB_PORT,
    cursor_factory=DictCursor
)