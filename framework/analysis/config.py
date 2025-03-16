from dataclasses import dataclass
from datetime import timedelta
import os
from pathlib import Path
from typing import Iterable, Optional

from utils import PatternList

__dir__ = os.path.dirname(os.path.abspath(__file__))


# Database configuration
# DB_HOST = '0.0.0.0'
DB_HOST = os.environ.get("POSTGRES_HOST")
# DB_PORT = 55434
DB_PORT = os.environ.get("POSTGRES_PORT")
DB_USER = "postgres"
DB_PASSWORD = os.environ.get("POSTGRES_PASSWORD")
# DB_NAME = 'userdiff_manual___2024_08_07_19_32_28'
DB_NAME = os.environ.get("POSTGRES_DB")
# get the password from the secrets file
# with open(Path(__dir__).parent / 'framework' / 'crawler' / 'secrets' / 'db_password.txt', 'r') as f:
#     DB_PASSWORD = f.read().strip()


LIVE_REQUEST_FETCH_DURATION_DIST_FROM_NOW_SECONDS = 30
BATCH_PREANALYSIS_WAIT = timedelta(
    seconds=LIVE_REQUEST_FETCH_DURATION_DIST_FROM_NOW_SECONDS
)
BATCH_ANALYSIS_WAIT = timedelta(seconds=30)

# CONFIGURATION FOR PRE-FILTERING

ALLOWED_CONTENT_TYPES = [
    "xhr",
    "document",
    "fetch",
    "image",
    "media",
]

ADDITIONAL_BLOCK_RULES = []

with open(Path(__dir__) / "resources/additionalblockrules.txt", "r") as f:
    ADDITIONAL_BLOCK_RULES = f.read().splitlines()

# ADDITIONAL_BLOCK_RULES = [
#     "/recaptcha",
#     "/_next/static",
#     "*/site_images/*",
#     "/static",
#     "/pagead",
#     "*/ingest$3p",
#     "*/collect",
#     "*/challenge-platform",
#     "*/sync$3p",
#     "collector.*",
#     "firstpartycookie.*",
#     "snowplow.*",
#     "api.pico.*",
# ]

AUTH_COOKIE_REGEX = r"(?i)(auth|session|token|jwt|cookie|uid|csrf)"

# Matching constants

MIN_URL_DIST = 3


# Default AUTO ANALSIS CONFIGURATION


@dataclass
class AUTO_ANALYSIS_CONFIG:

    UNIFY_VARIABLE_NAMES: bool = True

    # configuration for creating swap requests
    # MAX_SWAPS: int = 5
    MAX_SWAPS: int = 16

    SWAP_LOCATIONS_INCLUDE: Optional[Iterable[str]] = None
    SWAP_LOCATIONS_EXCLUDE: Optional[Iterable[str]] = None

    SWAP_NAME_INCLUDE: Optional[PatternList] = None
    SWAP_NAME_EXCLUDE: Optional[PatternList] = None
    SWAP_VALUE_INCLUDE: Optional[PatternList] = None
    SWAP_VALUE_EXCLUDE: Optional[PatternList] = None

    RANDOMIZE_LOCATION: bool = False

    SEED: Optional[int] = 34
