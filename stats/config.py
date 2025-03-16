import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

__dir__ = os.path.dirname(os.path.abspath(__file__))


# Database configuration
DB_HOST = os.environ.get("DB_HOST")
DB_PORT = os.environ.get("DB_PORT")
DB_USER = 'postgres'
DB_PASSWORD = os.environ.get("DB_PASSWORD")
DB_NAME = os.environ.get("DB_NAME")


# ACCF Database configuration
ACCF_DB_HOST = os.environ.get("ACCF_DB_HOST")
ACCF_DB_PORT = os.environ.get("ACCF_DB_PORT")
ACCF_DB_USER = 'postgres'
ACCF_DB_PASSWORD = os.environ.get("ACCF_DB_PASSWORD")
ACCF_DB_NAME = os.environ.get("ACCF_DB_NAME")

# additional configs for imports from framework/analysis to work
MIN_URL_DIST = 3
ADDITIONAL_BLOCK_RULES = []
ALLOWED_CONTENT_TYPES = [
    "xhr",
    "document",
    "fetch",
    "image",
    "media",
]