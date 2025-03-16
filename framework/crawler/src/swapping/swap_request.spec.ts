import { before, describe, it } from "node:test";
import { SwapRequest } from "./swap_request.js";
import { expect } from "playwright/test";
import { ParamTracker } from "./param_dictionary.js";

const BASE_SWAP_REQUEST_DICT = {
    "template": {
        "method": "GET",
        "url_path": {
            "type": "StringTemplate",
            "template": "https://example.com/users/(?P<user_id>[^/]+)/transactions",
            "variable_names": [
                "user_id"
            ],
            "locked": false
        },
        "headers": {
            "type": "DictTemplate",
            "entries": [
                {
                    "type": "KeyValTemplate",
                    "key": {
                        "type": "StringTemplate",
                        "template": "Content-Type",
                        "variable_names": [],
                        "locked": false
                    },
                    "value": {
                        "type": "StringTemplate",
                        "template": "application/json",
                        "variable_names": [],
                        "locked": false
                    }
                },
                {
                    "type": "KeyValTemplate",
                    "key": {
                        "type": "StringTemplate",
                        "template": "Authorization",
                        "variable_names": [],
                        "locked": false
                    },
                    "value": {
                        "type": "StringTemplate",
                        "template": "Bearer (?P<auth_token>[^/]+)",
                        "variable_names": [
                            "auth_token"
                        ],
                        "locked": false
                    }
                }
            ]
        },
        "query": {
            "type": "DictTemplate",
            "entries": [
                {
                    "type": "KeyValTemplate",
                    "key": {
                        "type": "StringTemplate",
                        "template": "rnd",
                        "variable_names": [],
                        "locked": false
                    },
                    "value": {
                        "type": "StringTemplate",
                        "template": "1934",
                        "variable_names": [],
                        "locked": false
                    }
                },
                {
                    "type": "KeyValTemplate",
                    "key": {
                        "type": "StringTemplate",
                        "template": "page",
                        "variable_names": [],
                        "locked": false
                    },
                    "value": {
                        "type": "StringTemplate",
                        "template": "(?P<page_index>[^/]+)",
                        "variable_names": [
                            "page_index"
                        ],
                        "locked": false
                    }
                }
            ]
        },
        "body": {
            "type": "StringTemplate",
            "template": "{\"user_id\": \"(?P<user_id>[^/]+)\"}",
            "variable_names": [
                "user_id"
            ],
            "locked": false
        },
        "variable_names": [
            "user_id",
            "page_index",
            "auth_token"
        ]
    },
    "variables": {
        "user_id": {
            "values": {
                "A": "u293840",
                "B": "u239489"
            }
        },
        "page_index": {
            "values": {
                "A": "1",
                "B": "2"
            }
        },
        "auth_token": {
            "values": {
                "A": "1234",
                "B": "2492"
            }
        }
    },
    "instances": [
        "A",
        "B"
    ]
}

describe("Loading swap request", () => {
    it("should load a swap request", () => {
        const swapRequest = SwapRequest.fromDict(BASE_SWAP_REQUEST_DICT);
        expect(swapRequest).toBeDefined();
        expect(swapRequest.template).toBeDefined();
        expect(swapRequest.variables).toBeDefined();
        expect(swapRequest.instances).toBeDefined();

        expect(swapRequest.template.method).toBe("GET");
        expect(swapRequest.template.urlPath.template).toBe("https://example.com/users/(?P<user_id>[^/]+)/transactions");
        expect(swapRequest.template.headers.entries.length).toBe(2);
        expect(swapRequest.template.query.entries.length).toBe(2);

        expect(swapRequest.variables.user_id.values.A).toBe("u293840");
        expect(swapRequest.variables.page_index.values.B).toBe("2");
        expect(swapRequest.variables.auth_token.values.A).toBe("1234");

        expect(swapRequest.instances.length).toBe(2);
    });
}
);


describe("Body output formatting", () => {

    let swapRequest: SwapRequest;
    let swap_request_dict_with_body: any;

    before(() => {
        swapRequest = SwapRequest.fromDict(BASE_SWAP_REQUEST_DICT);

        swap_request_dict_with_body = JSON.parse(JSON.stringify(BASE_SWAP_REQUEST_DICT));
        swap_request_dict_with_body.template.body.template = {
            "type": "DictTemplate",
            "entries": [
                {
                    "type": "KeyValTemplate",
                    "key": {
                        "type": "StringTemplate",
                        "template": "user_id",
                        "variable_names": [],
                        "locked": false
                    },
                    "value": {
                        "type": "StringTemplate",
                        "template": "u239489",
                        "variable_names": [],
                        "locked": false
                    }
                }
            ]
        };

        swap_request_dict_with_body.template.body.type = "BodyTemplate";
        swap_request_dict_with_body.template.body.encoding = "unknown";

    });

    it("should format the body correctly", () => {
        expect(swapRequest.template.body.encoding).toBe("unknown");
        const requestInstance = swapRequest.evaluate("B", "A", { user_id: { where: ['default'] } }, new ParamTracker());
        expect(requestInstance.body).toBe('{"user_id":"u239489"}');
    });

    it("should format the body correctly with JSON encoding", () => {
        swap_request_dict_with_body.template.body.encoding = "json";
        const swapRequestWithBody = SwapRequest.fromDict(swap_request_dict_with_body);
        const requestInstance = swapRequestWithBody.evaluate("B", "A", { user_id: { where: ['default'] } }, new ParamTracker());
        expect(requestInstance.body).toBe('{"user_id":"u239489"}');
    });

    it("should format the body correctly with form encoding", () => {
        swap_request_dict_with_body.template.body.encoding = "form";
        const swapRequestWithBody = SwapRequest.fromDict(swap_request_dict_with_body);
        const requestInstance = swapRequestWithBody.evaluate("B", "A", { user_id: { where: ['default'] } }, new ParamTracker());
        expect(requestInstance.body).toBe('user_id=u239489');
    });

    it("should format the body correctly with url encoded json", () => {
        swap_request_dict_with_body.template.body.encoding = "url_encoded_json";
        const swapRequestWithBody = SwapRequest.fromDict(swap_request_dict_with_body);
        const requestInstance = swapRequestWithBody.evaluate("B", "A", { user_id: { where: ['default'] } }, new ParamTracker());
        expect(requestInstance.body).toBe('%7B%22user_id%22%3A%22u239489%22%7D');
    });

    it("should format the body correctly with url encoded form", () => {
        swap_request_dict_with_body.template.body.encoding = "url_encoded_form";
        const swapRequestWithBody = SwapRequest.fromDict(swap_request_dict_with_body);
        const requestInstance = swapRequestWithBody.evaluate("B", "A", { user_id: { where: ['default'] } }, new ParamTracker());
        expect(requestInstance.body).toBe('user_id%3Du239489');
    });

    it("should format the body correctly with base64 json encoding", () => {
        swap_request_dict_with_body.template.body.encoding = "base64_json";
        const swapRequestWithBody = SwapRequest.fromDict(swap_request_dict_with_body);
        const requestInstance = swapRequestWithBody.evaluate("B", "A", { user_id: { where: ['default'] } }, new ParamTracker());
        expect(requestInstance.body).toBe('eyJ1c2VyX2lkIjoidTIzOTQ4OSJ9');
    });
});

describe("Request to dict", () => {

    it("should convert a swap request instance to a dict", () => {
        const swapRequest = SwapRequest.fromDict(BASE_SWAP_REQUEST_DICT);
        const instance = swapRequest.evaluate("B", "A", { user_id: { where: ['default'] } }, new ParamTracker());
        const dict = instance.toDict();
        expect(dict).toBeDefined();
        expect(dict.method).toBe("GET");
        expect(dict.url).toBe("https://example.com/users/u239489/transactions?rnd=1934&page=1");
        expect(dict.headers).toBeDefined();
        expect(dict.headers["Content-Type"]).toBe("application/json");
        expect(dict.headers["Authorization"]).toBe("Bearer 1234");
        expect(dict.body).toBe('{"user_id":"u239489"}');
    });
}
);

const BASE_SWAP_REQUEST_DICT2 = {"template": {"method": "POST", "url_path": {"type": "StringTemplate", "template": "https://direct\\.dy\\-api\\.eu/v2/serve/user/choose", "variable_names": [], "locked": false}, "headers": {"type": "DictTemplate", "entries": [{"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "accept", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "application/json,\\ text/plain,\\ \\*/\\*", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "dy\\-api\\-key", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "24d0a7a28dbe07d0f1ea5c61ee78c811ec50da552b5c5dbc081a3281a0ce1dab", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "sec\\-ch\\-ua\\-platform", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "\"Linux\"", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "sec\\-fetch\\-dest", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "empty", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "accept\\-language", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "en\\-US,en;q=0\\.9", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "origin", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "https://www\\.deichmann\\.com", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "priority", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "u=1,\\ i", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "referer", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "https://www\\.deichmann\\.com/", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "sec\\-ch\\-ua\\-mobile", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "\\?0", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "accept\\-encoding", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "gzip,\\ deflate,\\ br,\\ zstd", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "sec\\-ch\\-ua", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "\"Chromium\";v=\"127\",\\ \"Not\\)A;Brand\";v=\"99\"", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": ":path", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "/v2/serve/user/choose", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": ":scheme", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "https", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "content\\-type", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "application/json", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "sec\\-fetch\\-mode", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "cors", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "user\\-agent", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "Mozilla/5\\.0\\ \\(X11;\\ Linux\\ x86_64\\)\\ AppleWebKit/537\\.36\\ \\(KHTML,\\ like\\ Gecko\\)\\ Chrome/127\\.0\\.0\\.0\\ Safari/537\\.36", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": ":authority", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "direct\\.dy\\-api\\.eu", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "content\\-length", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "552", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": ":method", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "POST", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "sec\\-fetch\\-site", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "cross\\-site", "variable_names": [], "locked": false}}]}, "query": {"type": "DictTemplate", "entries": []}, "body": {"type": "BodyTemplate", "encoding": "json", "template": {"type": "DictTemplate", "entries": [{"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "user", "variable_names": [], "locked": false}, "value": {"type": "DictTemplate", "entries": [{"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "dyid", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "(?P<rootuserdyid_server__0>[^/]+)", "variable_names": ["rootuserdyid_server"], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "dyid_server", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "(?P<rootuserdyid_server__0>[^/]+)", "variable_names": ["rootuserdyid_server"], "locked": false}}]}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "session", "variable_names": [], "locked": false}, "value": {"type": "DictTemplate", "entries": [{"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "dy", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "(?P<rootsessiondy__0>[^/]+)", "variable_names": ["rootsessiondy"], "locked": false}}]}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "selector", "variable_names": [], "locked": false}, "value": {"type": "DictTemplate", "entries": [{"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "names", "variable_names": [], "locked": false}, "value": {"type": "ListTemplate", "entries": [{"type": "StringTemplate", "template": "ProductListWithBanner", "variable_names": [], "locked": false}]}}]}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "context", "variable_names": [], "locked": false}, "value": {"type": "DictTemplate", "entries": [{"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "page", "variable_names": [], "locked": false}, "value": {"type": "DictTemplate", "entries": [{"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "location", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "https://www\\.deichmann\\.com/de\\-de/schuhe/c\\-ds", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "type", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "CATEGORY", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "data", "variable_names": [], "locked": false}, "value": {"type": "ListTemplate", "entries": [{"type": "StringTemplate", "template": "Home", "variable_names": [], "locked": false}, {"type": "StringTemplate", "template": "Schuhe", "variable_names": [], "locked": false}]}}]}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "pageAttributes", "variable_names": [], "locked": false}, "value": {"type": "DictTemplate", "entries": [{"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "api_basestoreId", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "deichmann\\-de", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "api_categoryCode", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "default\\-shoes", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "api_productCategory", "variable_names": [], "locked": false}, "value": {"type": "DictTemplate", "entries": [{"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "allLevels", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "Schuhe,\\ Home", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "firstLevel", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "Schuhe", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "secondLevel", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "Home", "variable_names": [], "locked": false}}]}}]}}]}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "options", "variable_names": [], "locked": false}, "value": {"type": "DictTemplate", "entries": [{"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "returnAnalyticsMetadata", "variable_names": [], "locked": false}, "value": {"type": "IntegerTemplate", "template": "True", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "isImplicitImpressionMode", "variable_names": [], "locked": false}, "value": {"type": "IntegerTemplate", "template": "False", "variable_names": [], "locked": false}}]}}]}}, "variable_names": ["rootuserdyid_server", "rootsessiondy"]}, "variables": {"rootuserdyid_server": {"values": {"225": "7331861157159083574", "335": "-7160722443719736259"}}, "rootsessiondy": {"values": {"225": "l2grmsmbg8kqe5rqi7eg3argu7xy9tc4", "335": "o6fmd39wf9r817irgth73de9bnndm48f"}}}, "instances": [225, 335]}
const VARIABLES_INTEREST = {"rootuserdyid_server": {"where": ["default", "body"]}}

describe("Request to dict with query", () => {

    it("should convert a swap request instance to a dict with query", () => {

        const swapRequest = SwapRequest.fromDict(BASE_SWAP_REQUEST_DICT2);
        const instance = swapRequest.evaluate(225, 335, VARIABLES_INTEREST, new ParamTracker());
        const dict = instance.toDict();
        console.log(dict);

        expect(dict).toBeDefined();
    });
});


const BASE_SWAP_REQUEST_DICT3 = {"template": {"method": "POST", "url_path": {"type": "StringTemplate", "template": "https://issuu\\.com/call/publisher_workflow/state/(?P<url_6__0>[^/]+)", "variable_names": ["url_6"], "locked": false}, "headers": {"type": "DictTemplate", "entries": [{"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": ":authority", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "issuu\\.com", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": ":method", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "POST", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": ":path", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "/call/publisher_workflow/state/(?P<url_6__0>[^/]+)", "variable_names": ["url_6"], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": ":scheme", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "https", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "accept", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "\\*/\\*", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "accept\\-encoding", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "gzip,\\ deflate,\\ br,\\ zstd", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "accept\\-language", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "en\\-US,en;q=0\\.9", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "content\\-length", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "47", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "content\\-type", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "application/json", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "cookie", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "iutk=1305530d\\-e35e\\-4efd\\-8c05\\-ef3ee76934ad;\\ CookieConsent=\\{stamp:%27D9uzQbe\\+hGkxrU3exyTFGRFcmqsNjJ57xfHsluaOVtK03hvIyUU6mg==%27%2Cnecessary:true%2Cpreferences:true%2Cstatistics:true%2Cmarketing:true%2Cmethod:%27explicit%27%2Cver:3%2Cutc:1726912631548%2Ciab2:%27CQFTH0AQFTH0ACGABBENBHFsAP_gAEPgAAAAKbtV_G__bWlr8X73aftkeY1P9_h77sQxBhfJE\\-4FzLvW_JwXx2ExNA36tqIKmRIAu3bBIQNlGJDUTVCgaogVryDMaE2coTNKJ6BkiFMRM2dYCF5vm4tj\\-QKY5vr991dx2B\\-t7dr83dzyz4VHn3a5_2a0WJCdA5\\-tDfv9bROb\\-9IOd_x8v4v8_F_rE2_eT1l_tWvp7D9\\-cts7_XW89_fff_9Ln_\\-uB_\\-_2CmQBJhoVEAZYEhIQaBhBAgBUFYQEUCAAAAEgaICAEwYFOwMAl1hIgBACgAGCAEAAKMgAQAAAQAIRABAAUCAACAQKAAMACAYCAAgYAAQAWAgEAAIDoGKYEECgWACRmREKYEIQCQQEtlQgkAQIK4QhFngEQCImCgAAAAAKwABAWCwOJJASoSCBLiDaAAAgAQCCAAoQScmAAIAzZag8GTaMrTANHzBIhpgGQAA\\.YAAAAAAAAAA%27%2Cgacm:%272\\~AAAAAAAAAAACAABAAAgAIAAABAAAAAAACAAAAAAAAAAQAAAAAAABABAAAAAAAAAAAAAAAQAAAAAAAAAAAgMAAAAAAAgAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAQAAAAAAFAAAAAAAAAAAAAAAAABAAAAAAAAAAACAAABAAAAAAAAAAAAAAAAAABAQAAAEAAAAAAAAAAAAAAAAAAACBAAAAAAAAAAAAQAAAAAAAAAAgAAAAAAAQAAAAAAAAAAAAAAAACAgBAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAgAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAAAAkQAAAAAAAAAAAAAAAAQ=fmR2Lg==AA==%27%2Cregion:%27de%27\\};\\ _gid=GA1\\.2\\.1554532082\\.1726912632;\\ _gcl_au=1\\.1\\.130736518\\.1726912632;\\ _fbp=fb\\.1\\.1726912632132\\.205370621801960940;\\ __qca=P0\\-1644751341\\-1726912631905;\\ _pin_unauth=dWlkPU9HRTJOalJrWmpVdE0yUmxZUzAwWkRCakxUazVOVFV0T1RWbVlUUXhNekprTVRBeg;\\ CSRF\\-TOKEN=47291242542b4eb5e5a90e0e920e9ecb8a1acad0;\\ site\\.model\\.token=v7:24f0c4e744f972a1ac34b0bc9c94c406st;\\ site\\.model\\.username=autokrabbe;\\ __zlcmid=1Nrn2KFKeaVuShv;\\ _hjSessionUser_816645=eyJpZCI6IjI4YmE4ODZkLWJhMTMtNTY3NC1hNjFjLTcyYmNjODhkOWEzZCIsImNyZWF0ZWQiOjE3MjY5MTI2NTMwNzMsImV4aXN0aW5nIjp0cnVlfQ==;\\ issuu\\.termsAccepted=true;\\ _hjSession_816645=eyJpZCI6ImQxMjNmNWY3LTk3YjQtNGFmYS04MGY5LTA0NTY5NWIwZjlmYyIsImMiOjE3Mjg5NTA2NjM0MjUsInMiOjAsInIiOjAsInNiIjowLCJzciI6MCwic2UiOjAsImZzIjowLCJzcCI6MH0=;\\ mp_0cf3d1ea9fed57d54806204357b15a81_mixpanel=%7B%22distinct_id%22%3A%20%22%24device%3A192140393ff429c\\-048ed7d0f0c3b4\\-17462c6f\\-e1000\\-192140393ff429c%22%2C%22%24device_id%22%3A%20%22192140393ff429c\\-048ed7d0f0c3b4\\-17462c6f\\-e1000\\-192140393ff429c%22%2C%22%24initial_referrer%22%3A%20%22%24direct%22%2C%22%24initial_referring_domain%22%3A%20%22%24direct%22%2C%22__mps%22%3A%20%7B%7D%2C%22__mpso%22%3A%20%7B%22%24initial_referrer%22%3A%20%22%24direct%22%2C%22%24initial_referring_domain%22%3A%20%22%24direct%22%7D%2C%22__mpus%22%3A%20%7B%7D%2C%22__mpa%22%3A%20%7B%7D%2C%22__mpu%22%3A%20%7B%7D%2C%22__mpr%22%3A%20%5B%5D%2C%22__mpap%22%3A%20%5B%5D%2C%22Current%20Plan%22%3A%20%22FREE%22%2C%22User%20ID%22%3A%202103158590%7D;\\ _rdt_uuid=1726912632114\\.26fc8969\\-0cfc\\-417c\\-9fb9\\-2ebeb9ff2690;\\ _ga=GA1\\.1\\.90270082\\.1726912632;\\ _uetsid=df7d387077ff11ef8f71dd884a4a745b\\|1x8qenr\\|2\\|fq1\\|0\\|1725;\\ _uetvid=df7d829077ff11efbcffab28add5c5b7\\|vu0dww\\|1728952544418\\|19\\|1\\|bat\\.bing\\.com/p/insights/c/z;\\ _ga_ZX6FQZQK7C=GS1\\.1\\.1728950663\\.48\\.1\\.1728952544\\.2\\.0\\.0;\\ site\\.model\\.loginTimeout=1729211804000", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "downlink", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "10", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "dpr", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "1", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "ect", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "4g", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "origin", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "https://issuu\\.com", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "priority", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "u=1,\\ i", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "referer", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "https://issuu\\.com/home/docs/k3l5o25v2si/links", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "sec\\-ch\\-ua", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "\"Chromium\";v=\"127\",\\ \"Not\\)A;Brand\";v=\"99\"", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "sec\\-ch\\-ua\\-mobile", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "\\?0", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "sec\\-ch\\-ua\\-platform", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "\"Linux\"", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "sec\\-fetch\\-dest", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "empty", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "sec\\-fetch\\-mode", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "cors", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "sec\\-fetch\\-site", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "same\\-origin", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "user\\-agent", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "Mozilla/5\\.0\\ \\(X11;\\ Linux\\ x86_64\\)\\ AppleWebKit/537\\.36\\ \\(KHTML,\\ like\\ Gecko\\)\\ Chrome/127\\.0\\.0\\.0\\ Safari/537\\.36", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "viewport\\-width", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "1280", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "x\\-csrf\\-token", "variable_names": [], "locked": false}, "value": {"type": "StringTemplate", "template": "47291242542b4eb5e5a90e0e920e9ecb8a1acad0", "variable_names": [], "locked": false}}]}, "query": {"type": "DictTemplate", "entries": []}, "body": {"type": "BodyTemplate", "encoding": "json", "template": {"type": "DictTemplate", "entries": [{"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "stepperLinkEditor", "variable_names": [], "locked": false}, "value": {"type": "IntegerTemplate", "template": "True", "variable_names": [], "locked": false}}, {"type": "KeyValTemplate", "key": {"type": "StringTemplate", "template": "stepperShare", "variable_names": [], "locked": false}, "value": {"type": "IntegerTemplate", "template": "False", "variable_names": [], "locked": false}}]}}, "variable_names": ["url_6"]}, "variables": {"url_6": {"values": {"242": "DRAFT:k3l5o25v2si", "316": "DRAFT:fgcrlsym2kf"}}}, "instances": [242, 316]}

const VARIABLES_INTEREST3 = {"url_6": {"where": ["default", "url_path"]}}

describe("example swap request", ()=>{

    it("should convert a swap request instance body to a parsable JSON dict", () => {

        const swapRequest = SwapRequest.fromDict(BASE_SWAP_REQUEST_DICT3);
        const instance = swapRequest.evaluate(242, 316, VARIABLES_INTEREST3, new ParamTracker());
        const dict = instance.toDict();
        console.log(JSON.stringify(dict, null, 2));

        expect(JSON.parse(dict.body)).toBeDefined();
    });

})