""" This module contains the classes that represent the requests and responses of a page load """

from pathlib import Path
from typing import Dict
from urllib.parse import parse_qs, urlparse

from utils import PatternList, normalize_dict


class IRequest:

    request_id: int
    report_id: int
    client_frame_id: int
    url: str
    method: str
    headers: Dict[str, str]
    body: str

    # hashes
    full_hash = None

    def __init__(self, request):

        self.request_id = request.request_id
        self.report_id = request.report_id
        self.client_frame_id = request.client_frame_id
        self.url = request.url
        self.method = request.method
        self.headers = headers_to_dict(request.headers)
        self.body = request.body

    def to_dict(self):
        return {
            "request_id": self.request_id,
            "report_id": self.report_id,
            "client_frame_id": self.client_frame_id,
            "url": self.url,
            "method": self.method,
            "headers": self.headers,
            "body": self.body,
        }


class IResponse:

    response_id: int
    request_id: int
    status_code: int
    headers: Dict[str, str]
    body_hash: str
    resource_type: str

    # hashes
    full_hash = None

    def __init__(self, response):

        self.response_id = response.response_id
        self.request_id = response.request_id
        self.status_code = response.status_code
        self.headers = headers_to_dict(response.headers)
        self.body_hash = response.hash
        self.resource_type = response.resource_type

    def to_dict(self):
        return {
            "response_id": self.response_id,
            "request_id": self.request_id,
            "status_code": self.status_code,
            "headers": self.headers,
            "body_hash": self.body_hash,
            "resource_type": self.resource_type,
        }


class IRequestResponse:

    request: IRequest
    response: IResponse

    def __init__(self, response):
        self.request = IRequest(response.request)
        self.response = IResponse(response)

    def items(self):
        return self.request, self.response

    def to_dict(self):
        return {"request": self.request.to_dict(), "response": self.response.to_dict()}


def headers_to_dict(headers):
    d = {}

    for header in headers:
        d[header.name.lower()] = header.value

    return d


def split_url_into_path_and_query(url):

    parsed = urlparse(url)

    query_dict = parse_qs(parsed.query)
    
    # we need to normalize query dict
    query_dict = normalize_dict(query_dict)

    _path = parsed.scheme + "://" + parsed.netloc + parsed.path

    return _path, query_dict


QUERY_PARAMETERS_NAME_IGNORED = PatternList.from_file(
    Path(__file__).parent / "resources/queryparameternameignore.txt"
)

QUERY_PARAMETERS_VALUE_IGNORED = PatternList.from_file(
    Path(__file__).parent / "resources/queryparametervalueignore.txt"
)


def sanitize_url(url: str) -> str:
    p = urlparse(url)

    # remove ignored query parameters
    query = p.query.split("&")

    query = []

    for q in p.query.split("&"):
        fragments = q.split("=")
        if len(fragments) == 2:
            name, value = fragments

        else:
            name = fragments[0]
            value = ""

        if not QUERY_PARAMETERS_NAME_IGNORED.matches(
            name
        ) and not QUERY_PARAMETERS_VALUE_IGNORED.matches(value):
            query.append(q)

    p = p._replace(query="&".join(query))

    return p.geturl()


