import json
from pathlib import Path
from typing import List, Optional, Tuple
from urllib.parse import urlparse
import numpy as np

import config

from reqresp import IRequestResponse, sanitize_url


def query_parameters_dist(query1, query2):

    q1 = set(query1.split("&"))
    q2 = set(query2.split("&"))

    return len(q1.symmetric_difference(q2))


def url_dist(url1, url2):

    p1 = urlparse(sanitize_url(url1))
    p2 = urlparse(sanitize_url(url2))

    if p1.scheme != p2.scheme:
        return np.inf, np.inf

    if p1.netloc != p2.netloc:
        return np.inf, np.inf

    if len(p1.path) != len(p2.path):
        return np.inf, np.inf

    # compare how many parts are different

    n = 0
    path1 = p1.path.split("/")
    path2 = p2.path.split("/")

    for i in range(min(len(path1), len(path2))):
        if path1[i] != path2[i]:
            n += 1

    return n, query_parameters_dist(p1.query, p2.query)


def match_requests(
    requests1: List[IRequestResponse],
    requests2: List[IRequestResponse],
    min_dist=config.MIN_URL_DIST,
    report_dir: Optional[Path] = None,
    debug: bool = True,
) -> Tuple[List[Tuple[IRequestResponse, IRequestResponse, int]], dict]:

    distances = []

    rejected_matches = []

    for req1 in requests1:

        for req2 in requests2:

            # only match requests with the same method
            if req1.request.method != req2.request.method:
                continue

            path_dist, query_dist = url_dist(req1.request.url, req2.request.url)

            distances.append(((path_dist, query_dist), (req1, req2)))

    # sort distances
    distances.sort(key=lambda x: x[0])

    matches = []
    matched1 = set()
    matched2 = set()

    for (path_dist, query_dist), (req1, req2) in distances:

        if req1.request.request_id in matched1 or req2.request.request_id in matched2:
            continue

        if path_dist <= min_dist:

            matched1.add(req1.request.request_id)
            matched2.add(req2.request.request_id)

            matches.append((req1, req2, path_dist, query_dist))

        elif path_dist < np.inf:

            rejected_matches.append(
                {"req1": req1.to_dict(), "req2": req2.to_dict(), "path_dist": path_dist}
            )

    unmatched = {
        "requests1": [
            req.to_dict() for req in requests1 if req.request.request_id not in matched1
        ],
        "requests2": [
            req.to_dict() for req in requests2 if req.request.request_id not in matched2
        ],
    }

    report = {
        "rejected_matches": rejected_matches,
        "unmatched": unmatched,
    }

    if report_dir:
        with open(report_dir / "matching_report.json", "w") as f:
            json.dump(report, f, indent=2)

    if debug:
        print("-------------------")
        print("MATCHING HEURISTIC")
        print("Total requests1:", len(requests1))
        print("Total requests2:", len(requests2))
        print("Matches:", len(matches))
        print("Rejected matches:", len(rejected_matches))
        print("Unmatched requests1:", len(unmatched["requests1"]))
        print("Unmatched requests2:", len(unmatched["requests2"]))

    return matches, report
