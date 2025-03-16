import json
from multiprocessing import Pool
from pathlib import Path
from typing import List, Optional
import xxhash

from reqresp import IRequest, IResponse, IRequestResponse


def _hash_list(*args):

    x = xxhash.xxh64()
    _encoded = []
    # turn args to encoded strings and join them
    for arg in args:
        if arg is None:
            _encoded.append(b"")
        elif isinstance(arg, str):
            _encoded.append(arg.encode())
        elif isinstance(arg, bytes):
            _encoded.append(arg)
        else:
            _encoded.append(str(arg).encode())

        x.update(_encoded[-1])

    # return md5(b"".join(_encoded)).hexdigest()
    return x.digest()


# import time

# duration_components = []
# duration_hashing = []


def request_hash(request: IRequest):

    # tic = time.time()
    components = [
        request.method,
        request.url,
        request.body,
        request.headers.get("authorization", ""),
        request.headers.get("cookie", ""),
        request.headers.get("content-type", ""),
        request.headers.get("accept", ""),
    ]
    # duration_components.append(time.time() - tic)

    # tic = time.time()

    h = _hash_list(*components)

    # duration_hashing.append(time.time() - tic)

    return h


def response_hash(response: IResponse):

    components = [
        response.status_code,
        response.body_hash,
        response.headers.get("set-cookie", ""),
        response.headers.get("content-type", ""),
    ]

    return _hash_list(*components)


def hash_batch(batch):
    return [
        (request_hash(request), response_hash(response)) for request, response in batch
    ]

def make_dict_safe_for_json(d):
    # turn all byte keys into strings
    # do it recursively
    if isinstance(d, dict):
        return {k.hex() if isinstance(k, bytes) else k: make_dict_safe_for_json(v) for k, v in d.items()}
    elif isinstance(d, list):
        return [make_dict_safe_for_json(v) for v in d]
    elif isinstance(d, bytes):
        return d.hex()
    else:
        return d
        

def request_responses_hashes_parallel(
    responses: List[IRequestResponse], batch_size=100
):

    hashes = []

    pairs = [(r.request, r.response) for r in responses]

    batches = [pairs[i : i + batch_size] for i in range(0, len(pairs), batch_size)]

    with Pool() as p:
        hashes = p.map(hash_batch, batches)

    hashes = [item for sublist in hashes for item in sublist]

    return hashes


def remove_identical_responses(
    pairsA: List[IRequestResponse],
    pairsB: List[IRequestResponse],
    report_dir: Optional[Path] = None,
):

    # print(
    #     f"Comparing {len(responsesA)} responses from report A with {len(responsesB)} responses from report B"
    # )

    hashesA = {k: v for k, v in zip(request_responses_hashes_parallel(pairsA), pairsA)}
    hashesB = {k: v for k, v in zip(request_responses_hashes_parallel(pairsB), pairsB)}
    
    n_hashesA = len(hashesA)
    n_hashesB = len(hashesB)
    
    if n_hashesA == 0 or n_hashesB == 0:
        return ([], []), {}

    # print(f"{n} unique in both reports")

    for hashA in list(hashesA.keys()):
        if hashA in hashesB:
            del hashesA[hashA]
            del hashesB[hashA]

    hash_count_matrix = {
        "only_request": 0,
        "only_response": 0,
        "none": 0,
    }

    req_hashesA, resp_hashesA = zip(*hashesA.keys())
    req_hashesB, resp_hashesB = zip(*hashesB.keys())

    req_hashes_both = set(req_hashesA) & set(req_hashesB)
    resp_hashes_both = set(resp_hashesA) & set(resp_hashesB)

    hash_count_matrix["only_request"] = len(req_hashes_both)
    hash_count_matrix["only_response"] = len(resp_hashes_both)
    hash_count_matrix["none"] = (
        len(hashesA)
        - hash_count_matrix["only_request"]
        - hash_count_matrix["only_response"]
    )

    reqresp_req_hash_same = {}

    for (req_hash, _), reqresp in hashesA.items():

        if req_hash not in req_hashes_both:
            continue

        if req_hash not in reqresp_req_hash_same:
            reqresp_req_hash_same[req_hash] = {
                "req": reqresp.request.to_dict(),
            }
        else:
            reqresp_req_hash_same[req_hash]["resp1"] = reqresp.response.to_dict()

    for (req_hash, _), reqresp in hashesB.items():

        if req_hash in req_hashes_both:
            reqresp_req_hash_same[req_hash]["resp2"] = reqresp.response.to_dict()

    reqresp_resp_hash_same = {}

    for (_, resp_hash), reqresp in hashesA.items():

        if resp_hash not in resp_hashes_both:
            continue

        if resp_hash not in reqresp_resp_hash_same:
            reqresp_resp_hash_same[resp_hash] = {
                "resp": reqresp.response.to_dict(),
            }

    
        reqresp_resp_hash_same[resp_hash]["req1"] = reqresp.request.to_dict()

    for (_, resp_hash), reqresp in hashesB.items():

        if resp_hash in resp_hashes_both:
            reqresp_resp_hash_same[resp_hash]["req2"] = reqresp.request.to_dict()


    report_dict = {
        "counts": hash_count_matrix,
        "only_request": reqresp_req_hash_same,
        "only_response": reqresp_resp_hash_same,
    }

    if report_dir:
        report_dir.mkdir(parents=True, exist_ok=True)
        with open(report_dir / "identical_responses.json", "w") as f:
            f.write(json.dumps(make_dict_safe_for_json(report_dict), indent=2))

    # print(f"Removed {n - len(hashesA)} identical responses")
    
    print("-------------------")
    print("REMOVING IDENTICAL RESPONSES")
    print("Total requests: ", len(pairsA) + len(pairsB))
    print("Unique requests: ", n_hashesA + n_hashesB)
    print("Unique requests in A: ", n_hashesA)
    print("Unique requests in B: ", n_hashesB)
    
    print("Identical requests/responses in A and B: ", n_hashesA - len(hashesA))

    print("Pairs with only same request hash: ", hash_count_matrix["only_request"])
    print("Pairs with only same response hash: ", hash_count_matrix["only_response"])
    print("Pairs with different request and response hashes: ", hash_count_matrix["none"])


    return (list(hashesA.values()), list(hashesB.values())), report_dict
