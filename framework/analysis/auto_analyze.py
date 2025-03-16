from collections import defaultdict
from datetime import datetime
from pathlib import Path
import random
import re
from deepdiff import DeepDiff
from matplotlib.pylab import f
from swap_candidate import (
    BodyEncoding,
    BodyInstance,
    MultipleValuesForVariableError,
    RequestInstance,
    SwapRequest,
)
from utils import PatternList, normalize_dict, normalize_variable_name
from reqresp import sanitize_url
import config
import itertools
import db


HEADERS_IGNORED = PatternList.from_file(
    Path(__file__).parent / "resources/headerignore.txt"
)
COOKIES_IGNORED = PatternList.from_file(
    Path(__file__).parent / "resources/cookieignore.txt"
)
QUERY_NAMES_IGNORED = PatternList.from_file(
    Path(__file__).parent / "resources/queryparameternameignore.txt"
)
VARIABLE_NAMES_IGNORED = PatternList.from_file(
    Path(__file__).parent / "resources/variablenameignore.txt"
)
VARIABLE_NAMES_SWAPPABLE = PatternList.from_file(
    Path(__file__).parent / "resources/variablenameswappable.txt"
)
VARIABLE_VALUES_SWAPPABLE = PatternList.from_file(
    Path(__file__).parent / "resources/variablevalueswappable.txt"
)


class DiffingOutOfScope(Exception):
    pass


def variables_in_url_path(path1: str, path2: str):

    # split path into parts
    parts1 = {i: seg for i, seg in enumerate(path1.split("/"))}
    parts2 = {i: seg for i, seg in enumerate(path2.split("/"))}

    # find differences
    diff = DeepDiff(parts1, parts2)

    variables = {}

    for change in diff.get("values_changed", {}):
        segment = change.split("[")[1].split("]")[0]

        variables[f"url_{segment}"] = {
            "value1": diff["values_changed"][change]["old_value"],
            "value2": diff["values_changed"][change]["new_value"],
        }

    # DEV: this is a limitation to ignore requests with varying path sizes
    if "dictionary_item_added" in diff or "dictionary_item_removed" in diff:
        return {}

    # if len(diff) > 1:
    #     print(path1)
    #     print(path2)
    #     raise ValueError(diff.to_dict())

    return normalize_variable_name(variables)


def variables_in_url_query(query1: dict, query2: dict):

    diff = DeepDiff(normalize_dict(query1), normalize_dict(query2))

    variables = {}

    for change in diff.get("values_changed", {}):
        variables[change] = {
            "value1": diff["values_changed"][change]["old_value"],
            "value2": diff["values_changed"][change]["new_value"],
        }

    return normalize_variable_name(variables)


# {p1: ..., p2: ...}


def variables_in_headers(headers1: dict, headers2: dict):

    diff = DeepDiff(headers1, headers2)

    variables = {}

    for change in diff.get("values_changed", {}):
        variables[change] = {
            "value1": diff["values_changed"][change]["old_value"],
            "value2": diff["values_changed"][change]["new_value"],
        }

    if len(diff) > 1:
        raise ValueError(diff.to_dict(), indent=4)

    return normalize_variable_name(variables)


def variables_in_body(body1: BodyInstance, body2: BodyInstance, content_type: str):
    """

    Returns:
        variables: dict
            A dictionary with the variable names as keys and the values as values
        try_manual: bool
            Whether we should try to investigate the differences manually
    """

    if body1.encoding == BodyEncoding.NONE or body2.encoding == BodyEncoding.NONE:
        return {}, False

    # print(body2_dict)

    if body1.encoding == BodyEncoding.UNKOWN or body2.encoding == BodyEncoding.UNKOWN:
        return {}, True

    diff = DeepDiff(body1.value, body2.value).to_dict()

    # if "dictionary_item_added" in diff or "dictionary_item_removed" in diff:
    #     raise DiffingOutOfScope(f"Dictionary item added or removed:\n Body 1 {body1_dict}\n Body 2 {body2_dict}\n Diff {diff}")

    # LIMITATION: ignore dictionary item added or removed for now

    variables = {}

    for change in diff.get("values_changed", {}):
        variables[change] = {
            "value1": diff["values_changed"][change]["old_value"],
            "value2": diff["values_changed"][change]["new_value"],
        }

    return normalize_variable_name(variables), False


def find_variables(request1: RequestInstance, request2: RequestInstance):
    """

    Returns:
        variables: dict
            A dictionary with the variable names as keys and the values as values
        try_manual: bool
            Whether we should try to investigate the differences manually

    """

    variables = {}

    headers1 = {
        k: v for k, v in request1.headers.items() if not HEADERS_IGNORED.matches(k)
    }
    query1 = {
        k: v for k, v in request1.query.items() if not QUERY_NAMES_IGNORED.matches(k)
    }

    headers2 = {
        k: v for k, v in request2.headers.items() if not HEADERS_IGNORED.matches(k)
    }
    query2 = {
        k: v for k, v in request2.query.items() if not QUERY_NAMES_IGNORED.matches(k)
    }

    variables["url_path"] = variables_in_url_path(request1.url_path, request2.url_path)
    variables["query"] = variables_in_url_query(query1, query2)
    variables["body"], try_manual = variables_in_body(
        request1.body, request2.body, headers1.get("content-type", "")
    )
    variables["headers"] = variables_in_headers(headers1, headers2)

    # drop variables with values that are
    #  - too short
    #  - floats
    # this creates a problem while creating the swaprequestrepresetnation
    for location in variables:
        for name in list(variables[location].keys()):
            if (
                len(str(variables[location][name]["value1"])) < 3
                or isinstance(variables[location][name]["value1"], float)
                or isinstance(variables[location][name]["value2"], float)
            ):
                del variables[location][name]

    return variables, try_manual


def _matches_identity(value, keywords):
    if any(keyword in value for keyword in keywords):
        return True
    return False


def _is_timestamp(value, MAX_YEAR=2050, MIN_YEAR=1990):

    try:
        date = datetime.fromtimestamp(int(value))
    except (ValueError, OverflowError, OSError):
        try:
            date = datetime.fromtimestamp(int(value) / 1e3)
        except (ValueError, OverflowError, OSError):
            date = None

    if date is not None and MIN_YEAR < date.year < MAX_YEAR:
        return True
    else:
        return False


def _is_float(value, MAX_VALUE=1e5):
    try:
        float(value)
    except ValueError:
        return False

    # if int it might still just be an ID
    try:
        int(value)
        return False
    except:
        pass

    if float(value) > MAX_VALUE:
        return False

    return True


def should_swap(name, value, identity_keywords):

    if not isinstance(value, str) or not isinstance(name, str):
        return False, None, None, None, None

    if len(value) > 200 or len(value) < 3:
        return False, None, None, None, None

    extra_reason = None
    ignoring_name_rule = VARIABLE_NAMES_IGNORED.matching_rule(name.lower())
    matching_name_rule = VARIABLE_NAMES_SWAPPABLE.matching_rule(name.lower())
    matching_value_rule = VARIABLE_VALUES_SWAPPABLE.matching_rule(value.lower())

    should_swap = ignoring_name_rule is None and (
        matching_value_rule is not None or matching_name_rule is not None
    )

    if not matching_value_rule and _matches_identity(value.lower(), identity_keywords):
        should_swap = True
        extra_reason = "matches_identity"

    if should_swap and _is_timestamp(value):
        should_swap = False
        matching_value_rule = None
        matching_name_rule = None
        extra_reason = "is_timestamp"

    if should_swap and _is_float(value):
        should_swap = False
        matching_value_rule = None
        matching_name_rule = None
        extra_reason = "is_float"

    return (
        should_swap,
        ignoring_name_rule,
        matching_name_rule,
        matching_value_rule,
        extra_reason,
    )


def get_identity_keywords(response: "db.UserdiffResponse"):

    # get the report
    report = db.UserdiffReport.get(
        db.UserdiffReport.report_id == response.request.report_id
    )
    session = db.Session.get(db.Session.id == report.session_id)
    session_info = session.session_information

    return [
        session_info["account"]["credentials"]["username"].lower(),
        session_info["account"]["credentials"]["email"].lower(),
        session_info["account"]["credentials"]["identity"]["username"].lower(),
        session_info["account"]["credentials"]["identity"]["email"].lower(),
        session_info["account"]["credentials"]["identity"]["first_name"].lower(),
        session_info["account"]["credentials"]["identity"]["last_name"].lower(),
    ]


def get_account_id(response: db.UserdiffResponse):

    # get the report
    report = db.UserdiffReport.get(
        db.UserdiffReport.report_id == response.request.report_id
    )
    session = db.Session.get(db.Session.id == report.session_id)
    session_info = session.session_information

    return session_info["account"]["id"]


def process_candidate(
    candidate: db.AnalysisCandidatePair, conf=config.AUTO_ANALYSIS_CONFIG()
):
    """

    Returns:
        variables: dict
            A dictionary with the variable names as keys and the values as values
        swappable_keys: list
            A list of keys that are
        try_manual: bool
    """

    response1 = db.UserdiffResponse.get(
        db.UserdiffResponse.response_id == candidate.response_1_id
    )
    response2 = db.UserdiffResponse.get(
        db.UserdiffResponse.response_id == candidate.response_2_id
    )

    request1 = RequestInstance.from_request(
        response1.request, get_account_id(response1)
    )
    request2 = RequestInstance.from_request(
        response2.request, get_account_id(response2)
    )
    
    print("---------------------------------")
    print(f"Candidate {candidate.id} - {response1.request.url} - {response2.request.url}")

    if not should_process_candidate(response1, response2):
        print(f"Skipping candidate {candidate.id}")
        return None, [], None, None, False
    
    print(f"Processing candidate {candidate.id}")

    try:
        variables, try_manual = find_variables(request1, request2)
    except DiffingOutOfScope as e:
        # print(response1.request.url)
        # print(response2.request.url)
        # print(e)

        # if "snowplow" not in response1.request.url:
        #     input()
        return None, [], None, None, True

    if try_manual:
        return None, [], None, None, True

    # get identity keywords
    identity_keywords = get_identity_keywords(response1)
    identity_keywords.extend(get_identity_keywords(response2))

    # check if the variables are swappable

    swappable_keys = []

    for location in variables:
        for name in variables[location]:

            (
                _should_swap,
                ignoring_name_rule,
                matching_name_rule,
                matching_value_rule,
                extra_reason,
            ) = should_swap(
                name, variables[location][name]["value1"], identity_keywords
            )

            if _should_swap:
                swappable_keys.append((location, name))

            variables[location][name]["should_swap"] = _should_swap
            variables[location][name]["swapping_extra_info"] = {
                "ignoring_name_rule": ignoring_name_rule,
                "matching_name_rule": matching_name_rule,
                "matching_value_rule": matching_value_rule,
                "extra_reason": extra_reason,
            }

    if len(swappable_keys) == 0:
        return None, [], None, None, False

    # unify variable names
    if conf.UNIFY_VARIABLE_NAMES:
        variables = _unify_variable_names(variables)

    # generate swap requests
    request_template, variable_configurations = variables_to_swap_requests(
        variables,
        request1,
        request2,
        candidate.id,
        conf,
    )

    return variables, swappable_keys, request_template, variable_configurations, False


def _unify_variable_names(variables: dict):
    """
    Variable names from different locations can have different names.
    We should have the same name for the same variable in all locations.
    """

    variable_names = dict()

    for location in variables:
        for name in variables[location]:
            value = variables[location][name]["value1"]
            variable_names[str(value)] = name

    for location in variables:
        for name in list(variables[location].keys()):
            values = variables[location][name]
            variables[location][variable_names[str(values["value1"])]] = values

            if name != variable_names[str(values["value1"])]:
                del variables[location][name]

    return variables


def should_process_candidate(
    response1: db.UserdiffResponse, response2: db.UserdiffResponse
):
    
    # check if url or bodies are different
    if not (
        sanitize_url(response1.start_url) != sanitize_url(response2.start_url)
        or response1.request.body != response2.request.body
    ):
        return False

    # check if urls have different segments
    if len(response1.start_url.split("/")) != len(response2.start_url.split("/")):
        return False

    return True


def variables_to_swap_requests(
    variables: dict,
    request1: RequestInstance,
    request2: RequestInstance,
    candidate_id: int,
    conf: config.AUTO_ANALYSIS_CONFIG,
):
    """
    Transform the output variables into the swap request consumed by the swap experiment worker
    """

    variables_flattened = {}

    for location_variables in variables.values():
        for name, value in location_variables.items():
            variables_flattened[name] = value["value1"]

    try:
        request_template = SwapRequest.build(request1, variables_flattened)
        request_template.register_instance(request2)
    except MultipleValuesForVariableError as e:
        print("Found multiple values for the same key in candidate: ", candidate_id)
        return None, []

    # creating the swap configurations
    variable_configurations = []

    swap_locations = {"default"}
    swappable_variables = defaultdict(lambda: {"where": ["default"]})

    for location in variables:

        if conf.SWAP_LOCATIONS_INCLUDE and location not in conf.SWAP_LOCATIONS_INCLUDE:
            continue

        if conf.SWAP_LOCATIONS_EXCLUDE and location in conf.SWAP_LOCATIONS_EXCLUDE:
            continue

        for name in variables[location]:

            if not variables[location][name]["should_swap"]:
                continue

            if conf.SWAP_NAME_INCLUDE and not conf.SWAP_NAME_INCLUDE.matches(
                name, "search"
            ):
                continue

            if conf.SWAP_NAME_EXCLUDE and conf.SWAP_NAME_EXCLUDE.matches(
                name, "search"
            ):
                continue

            if conf.SWAP_VALUE_INCLUDE and not conf.SWAP_VALUE_INCLUDE.matches(
                variables[location][name]["value1"], "search"
            ):
                continue

            if conf.SWAP_VALUE_EXCLUDE and conf.SWAP_VALUE_EXCLUDE.matches(
                variables[location][name]["value1"], "search"
            ):
                continue
            
            # if it doesn't have at least two values
            if len(request_template.variables.get(name, {}).values) < 2:
                continue

            swappable_variables[name]["where"].append(location)
            swap_locations.add(location)

    if len(swappable_variables) == 0:
        return request_template, variable_configurations

    # set seed
    random.seed(conf.SEED + candidate_id)

    # get power set of swappable variables
    variable_combinations = []

    for i in range(1, len(swappable_variables)):
        variable_combinations += list(
            itertools.combinations(swappable_variables.keys(), i)
        )
        # variables_of_interest = {}
        # for name in subset:
        #     _new_var_locations = list(
        #         set(swappable_variables[name]["where"]) & swap_locations
        #     )

        #     if len(_new_var_locations) == 0:
        #         continue

        #     variables_of_interest[name] = {
        #         "where": _new_var_locations,
        #     }

        # if len(variables_of_interest) > 0:
        #     variable_combinations.append(variables_of_interest)

        # DEV: workaround to avoid space blowup
        if len(variable_combinations) > conf.MAX_SWAPS:
            break

    # keep the first one as all variables
    random.shuffle(variable_combinations)

    variable_combinations = variable_combinations[: conf.MAX_SWAPS]
    variable_combinations = [tuple(swappable_variables.keys())] + variable_combinations

    for _variable_names_to_swap in variable_combinations:

        _variable_names_to_swap = random.sample(
            list(swappable_variables.keys()),
            random.randint(1, len(swappable_variables)),
        )

        variables_of_interest = {}

        for name in _variable_names_to_swap:
            _new_var_locations = list(
                set(swappable_variables[name]["where"]) & swap_locations
            )

            if len(_new_var_locations) == 0:
                continue

            variables_of_interest[name] = {
                "where": _new_var_locations,
            }

        if len(variables_of_interest) == 0:
            continue

        variable_configurations.append(variables_of_interest)

    return request_template, variable_configurations


if __name__ == "__main__":
    
    for candidate in db.AnalysisCandidatePair.select().where(db.AnalysisCandidatePair.task_id == 29):
        process_candidate(candidate)
    

# if __name__ == "__main__":

#     args = parser.parse_args()


#     # make the params as environment variables
#     os.environ["POSTGRES_HOST"] = args.dbhost
#     os.environ["POSTGRES_PORT"] = "5432"
#     os.environ["POSTGRES_DB"] = args.dbname
#     os.environ["POSTGRES_USER"] = args.dbuser
#     os.environ["POSTGRES_PASSWORD"] = args.dbpwd
#     DATA_BASE = args.datapath
#     LOG_BASE = args.logpath

#     import db

#     main(args.num_workers)


# import pandas as pd

# out = []

# candidates = (
#     db.AnalysisCandidatePair.select()
#     # .where(
#     #     db.AnalysisCandidatePair.id==2171
#     # )
# )

# manual_swappable_candidate_ids = {x.candidate_pair_id for x in db.SwapCandidatePair.select(db.SwapCandidatePair.candidate_pair_id).distinct()}
# manual_swappable_candidate_ids -= {278, 382, 383, 587, 623, 624, 730, 731, 736, 776, 784, 792, 990, 1326}


# candidates = [c for c in candidates]
# values = []

# swap_candidates = []

# for candidate in candidates:
#     # if candidate.id < 920:
#     #     continue

#     variables, swappable_keys, request, variable_configurations, try_manual = (
#         process_candidate(candidate)
#     )

#     print(candidate.id, "Swappable" if len(swappable_keys) > 0 else "Useless", swappable_keys, "Try manual" if try_manual else "")

#     print(variable_configurations)

#     if len(swappable_keys) == 0 and candidate.id in manual_swappable_candidate_ids:
#         print("SHOULD BE SWAPPABLE")
#         exit(1)

#     if variables:
#         out.append(
#             {
#                 "candidate": candidate.id,
#                 "variables": json.dumps(variables),
#                 "swappable_keys": json.dumps(swappable_keys),
#                 "swappable": len(swappable_keys) > 0,
#             }
#         )

#         for variable_configuration in variable_configurations:
#             swap_candidates.append(
#                 {
#                     "candidate": candidate.id,
#                     "request_template": json.dumps(request.to_dict()),
#                     "variables_of_interest": json.dumps(variable_configuration),
#                 }
#             )

#         for location in variables:
#             for name in variables[location]:

#                 values.append(
#                     {
#                         "candidate": candidate.id,
#                         "location": location,
#                         "name": name,
#                         "value": variables[location][name]["value1"],
#                         "should_swap": variables[location][name]["should_swap"],
#                         "swapping_extra_info": variables[location][name][
#                             "swapping_extra_info"
#                         ],
#                     }
#                 )

#                 # values.append(
#                 #     {
#                 #         "candidate": candidate.id,
#                 #         "location": location,
#                 #         "name": name,
#                 #         "value": variables[location][name]["value2"],
#                 #     }
#                 # )

# variables_df = pd.DataFrame(out)
# variables_df.to_csv("variables.csv")
# values_df = pd.DataFrame(values)
# values_df.to_csv("values.csv")
# df = pd.DataFrame(swap_candidates)
# df.to_csv("swap_candidates.csv")

# print(variables_df['swappable_keys'].apply(lambda x: len(json.loads(x))).describe())
