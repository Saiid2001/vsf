from collections import defaultdict
import gzip
import json
from pathlib import Path
from typing import List, Optional
import braveblock
from urllib.parse import urlparse

import re

import tldextract
import config
from reqresp import IRequestResponse

__dir__ = Path(__file__).parent

# we need to include up to date easylist

# includes easylist and privacy list by default


def _read_from_filterlist_gzip(file_path: str) -> str:

    with open(file_path, "rb") as _word_frequencies_binary:
        compressed = _word_frequencies_binary.read()

    return gzip.decompress(compressed).decode().splitlines()


rules = _read_from_filterlist_gzip(
    __dir__.absolute() / "resources/easylist_2024.txt.gz"
)
rules += _read_from_filterlist_gzip(
    __dir__.absolute() / "resources/easyprivacy_2024.txt.gz"
)
rules += config.ADDITIONAL_BLOCK_RULES

ADBLOCKER = braveblock.Adblocker(
    rules=rules,
    include_easylist=False,
    include_easyprivacy=False,
)
# Mapping from playwright to braveblock
ADBLOCKER_RESOURCE_TYPE_MAPPING = {
    "document": "Document",
    "stylesheet": "Stylesheet",
    "image": "Image",
    "media": "Media",
    "font": "Font",
    "script": "Script",
    "texttrack": "Other",
    "xhr": "Xmlhttprequest",
    "fetch": "Fetch",
    "eventsource": "Other",
    "websocket": "Websocket",
    "manifest": "Other",
    "other": "Other",
}


def filter_by_party(pairs: List[IRequestResponse], subject_domain: str):

    fp_responses = []
    tp_responses = []

    for reqresp in pairs:
        url = reqresp.request.url
        req_domain = urlparse(url).netloc

        # if the domain is a subdomain of the party domain
        if req_domain.endswith(subject_domain):
            tp_responses.append(reqresp)
        else:
            fp_responses.append(reqresp)

    return tp_responses, fp_responses


def filter_by_adblocker(pairs: List[IRequestResponse], subject_url: str):

    blocked_responses = []
    allowed_responses = []

    for reqresp in pairs:

        if ADBLOCKER.check_network_urls(
            reqresp.request.url,
            source_url=subject_url,
            request_type=ADBLOCKER_RESOURCE_TYPE_MAPPING.get(
                reqresp.response.resource_type, ""
            ),
        ):
            blocked_responses.append(reqresp)

        else:
            allowed_responses.append(reqresp)

    return allowed_responses, blocked_responses


def fitler_by_content_type(
    pairs: List[IRequestResponse],
    content_types: List[str] = config.ALLOWED_CONTENT_TYPES,
):

    filtered_responses = []

    rejected_content_types = defaultdict(int)

    for reqresp in pairs:
        if reqresp.response.resource_type in content_types:
            filtered_responses.append(reqresp)
        else:
            rejected_content_types[reqresp.response.resource_type] += 1

    return filtered_responses, rejected_content_types


def filter_only_authentication_bearing(pairs: List[IRequestResponse]):

    auth_responses = []
    non_auth_respponse = []

    rejected_cookie_names = defaultdict(int)

    for reqresp in pairs:
        if "authorization" in reqresp.request.headers:
            auth_responses.append(reqresp)

        # could be in a cookie
        elif "cookie" in reqresp.request.headers:
            if re.search(config.AUTH_COOKIE_REGEX, reqresp.request.headers["cookie"]):
                auth_responses.append(reqresp)
            else:
                parsed_cookies = reqresp.request.headers["cookie"].split(";")
                for cookie in parsed_cookies:
                    cookie_name = cookie.split("=")[0].strip()
                    rejected_cookie_names[cookie_name] += 1

                    # if cookie_name == "wrvUserID":
                    #     print(reqresp.request.url)

        # also allow all post requests
        elif reqresp.request.method == "POST":
            auth_responses.append(reqresp)

        else:
            non_auth_respponse.append(reqresp)

    return (auth_responses, non_auth_respponse), {
        "rejected_cookie_names": rejected_cookie_names
    }

def make_dict_safe_for_json(d):
    # turn all sets into lists
    
    if isinstance(d, dict):
        return {k: make_dict_safe_for_json(v) for k, v in d.items()}
    elif isinstance(d, list):
        return [make_dict_safe_for_json(v) for v in d]
    elif isinstance(d, set):
        return list(d)
    else:
        return d

def filter_interesting_non_auth(pairs: List[IRequestResponse]):

    interesting_responses = []

    request_params = defaultdict(set)
    request_route_segments = {
        "contains_number": defaultdict(set),
        "contains_special_char": defaultdict(set),
        "contains_capital_letter": defaultdict(set),
        "contains_slug": defaultdict(set),
        "other": defaultdict(set),
    }

    for reqresp in pairs:

        if reqresp.request.url:

            parsed_url = urlparse(reqresp.request.url)

            params = parsed_url.query.split("&")

            for param in params:
                name = param.split("=")[0]
                request_params[name].add(reqresp.request.url)

            path = parsed_url.path
            path_segments = path.split("/")

            for segment in path_segments:

                if any(char.isdigit() for char in segment):
                    request_route_segments["contains_number"][segment].add(
                        reqresp.request.url
                    )

                if any(char.isupper() for char in segment):
                    request_route_segments["contains_capital_letter"][segment].add(
                        reqresp.request.url
                    )

                if any(not char.isalnum() for char in segment):
                    request_route_segments["contains_special_char"][segment].add(
                        reqresp.request.url
                    )

                if "-" in segment:
                    request_route_segments["contains_slug"][segment].add(
                        reqresp.request.url
                    )

                # if segment == "api2":
                #     print(reqresp.request.url)

            # interesting if the query has a parameter similar to the cookies
            if re.search(config.AUTH_COOKIE_REGEX, parsed_url.query):
                interesting_responses.append(reqresp)

            elif re.search(config.AUTH_COOKIE_REGEX, path):
                interesting_responses.append(reqresp)

    return interesting_responses, {
        "counts": {
            "request_params": {k: len(v) for k, v in request_params.items()},
            "route_segments": {
                k: {kk: len(vv) for kk, vv in v.items()}
                for k, v in request_route_segments.items()
            },
        },
        "request_params": make_dict_safe_for_json(request_params),
        "route_segments": make_dict_safe_for_json(request_route_segments),
    }


def prefilter(
    pairs: List[IRequestResponse],
    subject_url: str,
    report_id: str,
    report_dir: Optional[Path] = None,
):

    report = {}

    registered_domain = tldextract.extract(subject_url).registered_domain

    fp_requests, tp_requests = filter_by_party(pairs, registered_domain)

    allowed_tp_requests, _ = filter_by_adblocker(tp_requests, subject_url)

    filtered_requests, report["rejected_content_types"] = fitler_by_content_type(
        fp_requests + allowed_tp_requests
    )

    (auth_requests, non_auth_requests), report["authentication"] = (
        filter_only_authentication_bearing(filtered_requests)
    )

    interesting_non_auth_requests, report["non_authentication"] = (
        filter_interesting_non_auth(non_auth_requests)
    )

    if report_dir is not None:
        with open(report_dir / f"{report_id}_prefilter.json", "w") as f:
            json.dump(report, f)

    allowed_requests = auth_requests + interesting_non_auth_requests

    print("-------------------")
    print("PRE-FILTERING RESULTS", report_id)
    print("Total requests: ", len(pairs))
    print("Accepted requests: ", len(allowed_requests))
    print("Rejected requests: ", len(pairs) - len(allowed_requests))
    print("Interesting non-auth requests: ", len(interesting_non_auth_requests))
    print("Blocked by adblocker: ", len(tp_requests) - len(allowed_tp_requests))

    return allowed_requests, report
