import { Logging } from "../utils/logging.js";
import { ALWAYS_FRESH, ParamLocation, ParamTracker } from "./param_dictionary.js";


export type IdType = string | number;

type VariableValuations = Record<string, Record<string, { val: string, origin: string }>>;

class MultipleValuesForVariableError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'MultipleValuesForVariableError';
    }
}

export const FORBIDDEN_HEADERS = [
    "Accept-Charset",
    "Accept-Encoding",
    "Access-Control-Request-Headers",
    "Access-Control-Request-Method",
    "Connection",
    "Content-Length",
    "Cookie",
    "Date",
    "DNT",
    "Expect",
    "Host",
    "Keep-Alive",
    "Origin",
    "Permissions-Policy",
    "Proxy-",
    "Sec-",
    "Referer",
    "TE",
    "Trailer",
    "Transfer-Encoding",
    "Upgrade",
    "Via",
    ":"
];

function checkForMultipleValues(dict1: Record<string, string>, dict2: Record<string, string>): void {
    const commonKeys = Object.keys(dict1).filter(key => key in dict2);

    for (const key of commonKeys) {
        if (dict1[key] !== dict2[key]) {
            throw new MultipleValuesForVariableError(`Multiple values for variable ${key}`);
        }
    }
}

function _variableValue(variables: VariableValuations, name: string, locationTags: string[]): { val: string, origin: string } {
    if (!(name in variables)) {
        throw new Error(`Variable ${name} not found`);
    }

    for (const loc of locationTags) {
        if (loc in variables[name]) {
            return variables[name][loc];
        }
    }

    return variables[name]["default"];
}

enum BodyEncoding {
    JSON = "json",
    FORM = "form",
    URL_ENCODED_FORM = "url_encoded_form",
    URL_ENCODED_JSON = "url_encoded_json",
    BASE64_JSON = "base64_json",
    UNKOWN = "unknown",
    NONE = "none",
}

export class BodyInstance {
    value: string | Record<string, any>;
    encoding: BodyEncoding;

    constructor(value: string | Record<string, any>, encoding: BodyEncoding) {
        this.value = value;
        this.encoding = encoding;
    }

    isDict(): boolean {
        return ![BodyEncoding.NONE, BodyEncoding.UNKOWN].includes(this.encoding);
    }

    toDict(): Record<string, any> {
        return {
            value: this.value,
            encoding: this.encoding
        };
    }

    static fromDict(dict: Record<string, any>): BodyInstance {
        return new BodyInstance(dict['value'], dict['encoding']);
    }

    compile(): string {
        switch (this.encoding) {
            case BodyEncoding.JSON:
                return JSON.stringify(this.value);
            case BodyEncoding.FORM:
                return new URLSearchParams(this.value as Record<string, string>).toString();
            case BodyEncoding.URL_ENCODED_FORM:
                return encodeURIComponent(new URLSearchParams(this.value as Record<string, string>).toString());
            case BodyEncoding.URL_ENCODED_JSON:
                return encodeURIComponent(JSON.stringify(this.value));
            case BodyEncoding.BASE64_JSON:
                return Buffer.from(JSON.stringify(this.value)).toString('base64');
            case BodyEncoding.NONE:
                return "";
            default:
                return this.value as string;
        }
    }
}

export class RequestInstance {
    instanceId: IdType;
    method: string;
    urlPath: string;
    headers: Record<string, string>;
    query: Record<string, string>;
    body?: BodyInstance;

    constructor(instanceId: IdType, method: string, urlPath: string, headers: Record<string, string>, query: Record<string, string>, body?: BodyInstance) {
        this.instanceId = instanceId;
        this.method = method;
        this.urlPath = urlPath;
        this.headers = headers;
        this.query = query;
        this.body = body;
    }

    toDict(): Record<string, any> {

        return {
            instance_id: this.instanceId,
            method: this.method,
            url: this.url,
            url_path: this.urlPath,
            headers: this.headers,
            query: this.query,
            body: this.body
        };
    }

    fromDict(dict: Record<string, any>): RequestInstance {
        return new RequestInstance(
            dict['instance_id'],
            dict['method'],
            dict['url_path'],
            dict['headers'],
            dict['query'],
            dict['body'] ? BodyInstance.fromDict(dict['body']) : undefined
        );
    }

    get url(): string {
        const query = new URLSearchParams(this.query).toString();
        return `${this.urlPath}?${query}`;
    }
}


class SwapVariable {
    values: Record<IdType, string>;

    constructor(values: Record<IdType, string> = {}) {
        this.values = values;
    }

    toDict(): Record<string, any> {
        return { values: this.values };
    }

    static fromDict(dict: Record<string, any>): SwapVariable {
        return new SwapVariable(dict['values']);
    }
}

class Template {
    type?: string;
    locked: boolean;

    constructor(locked: boolean = false) {
        this.locked = locked;
    }

    evaluate(variables: VariableValuations, locationTags: string[], sessionParamTracker: ParamTracker): any {
        throw new Error("Not implemented");
    }

    get isConstant(): boolean {
        return this.variableNames.length === 0;
    }

    toDict(): Record<string, any> {
        throw new Error("Not implemented");
    }

    static fromDict(dict: Record<string, any>): Template {
        if (!("type" in dict)) {
            throw new Error("Type not found in dict");
        }

        if (!(dict['type'] in TEMPLATE_MAP)) {
            throw new Error(`Type ${dict['type']} not found in TEMPLATE_MAP`);
        }

        return TEMPLATE_MAP[dict['type']].fromDict(dict);
    }

    usedASwapVariable(variables: VariableValuations, locationTags: string[]): boolean {
        throw new Error("Not implemented");
    }

    get variableNames(): string[] {
        throw new Error("Not implemented");
    }

}

class StringTemplate extends Template {
    type: string = "StringTemplate";
    _variableNames: string[];
    template: string;

    private static readonly COMPLETE_VALUE_REGEX = '((^|[/: ."\'&,]){value}([/: ."\'&,]|$))';

    constructor(template: string, variableNames: string[], locked: boolean) {
        super(locked);
        this._variableNames = variableNames;
        this.template = template;
    }

    static fromDict(dict: Record<string, any>): StringTemplate {
        return new StringTemplate(dict['template'], dict['variable_names'], dict['locked']);
    }

    evaluate(variables: VariableValuations, locationTags: string[], sessionParamTracker: ParamTracker): any {

        if (this.isConstant) {
            return this.template.replace(/\\(.)/g, '$1');
        }

        let val = this.template;
        for (const name of this.variableNames) {

            val = val.replace(`(?P<${name}>[^/]+)`, _variableValue(variables, name, locationTags).val);

            // also replace values that are indexed

            let i = 0;

            while (val.includes(`(?P<${name}__${i}>[^/]+)`)) {
                val = val.replace(`(?P<${name}__${i}>[^/]+)`, _variableValue(variables, name, locationTags).val);
                i++;
            }
        }

        // decode escaped characters
        val = val.replace(/\\(.)/g, '$1');

        // will always update parameters from the session

        // check if val is a json string or URL encoded string
        if (val.startsWith("{") && val.endsWith("}") || val.startsWith("[") && val.endsWith("]")) {
            try {
                const parsed = JSON.parse(val);
                for (const [key, value] of Object.entries(parsed)) {
                    const sessionVal = sessionParamTracker.getLatestValue(key.toLowerCase());
                    if (sessionVal && ((key in variables && variables[key]['default'].origin === "ref") || ALWAYS_FRESH.includes(key.toLowerCase()))) {
                        parsed[key] = sessionVal.value;
                    }
                }
                val = JSON.stringify(parsed);
            } catch (e) {
                // not a json string
            }
        }

        else if (val.includes("=")) {
            const parsed = new URLSearchParams(val);
            for (const [key, value] of parsed.entries()) {

                const sessionVal = sessionParamTracker.getLatestValue(key.toLowerCase());

                if (sessionVal && ((key in variables && variables[key]['default'].origin === "ref") || ALWAYS_FRESH.includes(key.toLowerCase()))) {
                    Logging.info(`changing ${key} from ${value} to ${sessionVal.value}`);

                    parsed.set(key, sessionVal.value);
                }
            }
            val = parsed.toString();
        }

        return val;
    }

    toDict(): Record<string, any> {
        return {
            type: 'StringTemplate',
            template: this.template,
            variable_names: this.variableNames,
            locked: this.locked,
        };
    }

    usedASwapVariable(variables: VariableValuations, locationTags: string[]): boolean {
        return this.variableNames.some(name => _variableValue(variables, name, locationTags).origin === "swap");
    }

    get variableNames(): string[] {
        return this._variableNames;
    }
}

class IntegerTemplate extends StringTemplate {
    type: string = "IntegerTemplate";

    static fromDict(dict: Record<string, any>): IntegerTemplate {
        return new IntegerTemplate(dict['template'], dict['variable_names'], dict['locked']);
    }

    override evaluate(variables: VariableValuations, locationTags: string[], sessionParamTracker: ParamTracker): any {
        return parseInt(super.evaluate(variables, locationTags, sessionParamTracker));
    }

    toDict(): Record<string, any> {
        return {
            type: 'IntegerTemplate',
            template: this.template,
            variable_names: this.variableNames,
            locked: this.locked,
        };
    }
}

class KeyValTemplate {
    key: StringTemplate;
    value: Template;

    constructor(key: StringTemplate, value: Template) {
        this.key = key;
        this.value = value;
    }

    static fromDict(dict: Record<string, any>): KeyValTemplate {
        const key = StringTemplate.fromDict(dict['key']);
        const value = Template.fromDict(dict['value']);
        return new KeyValTemplate(key, value);
    }

    toDict(): Record<string, any> {
        return {
            type: 'KeyValTemplate',
            key: this.key.toDict(),
            value: this.value.toDict(),
        };
    }

    fromDict(dict: Record<string, any>): KeyValTemplate {
        const key = StringTemplate.fromDict(dict['key']);
        const value = StringTemplate.fromDict(dict['value']);
        return new KeyValTemplate(key, value);
    }
}


class DictTemplate extends Template {
    type: string = "DictTemplate";
    entries: KeyValTemplate[];

    constructor(entries: KeyValTemplate[]) {
        super();
        this.entries = entries;

    }

    override evaluate(variables: VariableValuations, locationTags: string[], sessionParamTracker: ParamTracker): any {
        // TODO: for now we are assuming that the key is always constant, later we should allow for variable keys

        const entriesEvaluated = this.entries
            .map(entry => [entry.key.evaluate({}, [], sessionParamTracker), entry.value.evaluate(variables, locationTags, sessionParamTracker)])
            .map(([key, value], i) => {

                if (!(value instanceof String || value instanceof Number)) {
                    return [key, value];
                }

                const sessionVal = sessionParamTracker.getLatestValue(key.toLowerCase());
                if (sessionVal && ((key in variables && !this.entries[i].value.usedASwapVariable(variables, locationTags)) || ALWAYS_FRESH.includes(key.toLowerCase()))) {
                    Logging.info(`changing ${key} from ${value} to ${sessionVal.value}`);

                    value = sessionVal.value;
                }

                return [key, value];
            });

        return Object.fromEntries(
            entriesEvaluated
        );
    }

    override get variableNames(): string[] {
        return Array.from(new Set(
            this.entries.flatMap(entry => [...entry.key.variableNames, ...entry.value.variableNames])
        ));
    }

    get isConstant(): boolean {
        return this.variableNames.length === 0;
    }

    toDict(): Record<string, any> {
        return {
            type: "DictTemplate",
            entries: this.entries.map(entry => entry.toDict()),
        };
    }

    static fromDict(dict: Record<string, any>): DictTemplate {
        const entries = dict['entries'].map((entryDict: Record<string, any>) => KeyValTemplate.fromDict(entryDict));
        return new DictTemplate(entries);
    }
}

class ListTemplate extends DictTemplate {
    type = "ListTemplate";

    constructor(entries: KeyValTemplate[]) {
        super(entries);
    }

    override evaluate(variables: VariableValuations, locationTags: string[], sessionParamTracker: ParamTracker): any {
        return this.entries.map(entry => entry.value.evaluate(variables, locationTags, sessionParamTracker));
    }

    override get variableNames(): string[] {
        return Array.from(new Set(
            this.entries.flatMap(entry => entry.value.variableNames)
        ));
    }

    toDict(): Record<string, any> {
        return {
            type: "ListTemplate",
            entries: this.entries.map(entry => entry.value.toDict()),
        };
    }

    static fromDict(dict: Record<string, any>): ListTemplate {
        const entries = dict['entries'].map((entryDict: Record<string, any>, i: number) => new KeyValTemplate(new StringTemplate(`list_item_${i}`, [], false), Template.fromDict(entryDict)));
        return new ListTemplate(entries);
    }
}

class BodyTemplate extends Template {
    encoding: BodyEncoding;
    template: Template;
    type: string = "BodyTemplate";

    constructor(template: Template, encoding: BodyEncoding) {
        super();
        this.template = template;
        this.encoding = encoding;
    }

    override evaluate(variables: VariableValuations, locationTags: string[], sessionParamTracker: ParamTracker): any {
        const body = new BodyInstance(this.template.evaluate(variables, locationTags, sessionParamTracker), this.encoding);

        return body.compile();
    }

    override get variableNames(): string[] {
        return this.template.variableNames;
    }

    toDict(): Record<string, any> {
        return {
            type: "BodyTemplate",
            template: this.template.toDict(),
            encoding: this.encoding,
        };
    }

    static fromDict(dict: Record<string, any>): BodyTemplate {

        let encoding: BodyEncoding, template: any;
        // backwards compatibility
        if (dict['type'] === "StringTemplate") {
            encoding = BodyEncoding.UNKOWN;
            template = dict;
        }
        else if (dict['type'] == "BodyTemplate") {
            encoding = dict['encoding'];
            template = dict['template'];
        }
        else {
            throw new Error(`Invalid type ${dict['type']} for BodyTemplate`);
        }

        if (template['type'] === "StringTemplate") {
            return new BodyTemplate(StringTemplate.fromDict(template), encoding);
        }
        else if (template['type'] === "DictTemplate") {
            return new BodyTemplate(DictTemplate.fromDict(template), encoding);
        }
        else if (template['type'] === "ListTemplate") {
            return new BodyTemplate(ListTemplate.fromDict(template), encoding);
        }
        else {
            throw new Error(`Invalid type ${template['type']} for BodyTemplate`);
        }

    }

}

const TEMPLATE_MAP: { [key: string]: any } = {
    "StringTemplate": StringTemplate,
    "IntegerTemplate": IntegerTemplate,
    "DictTemplate": DictTemplate,
    "ListTemplate": ListTemplate,
}

class SwapRequestTemplate {
    method: string;
    urlPath: StringTemplate;
    headers: DictTemplate;
    query: DictTemplate;
    body: BodyTemplate;
    variableNames: string[];

    constructor(
        method: string,
        urlPath: StringTemplate,
        headers: DictTemplate,
        query: DictTemplate,
        body: BodyTemplate,
        variableNames: string[]
    ) {
        this.method = method;
        this.urlPath = urlPath;
        this.headers = headers;
        this.query = query;
        this.body = body;
        this.variableNames = variableNames;
    }

    evaluate(variables: Record<string, Record<string, { val: string, origin: string }>>, sessionParamTracker: ParamTracker): RequestInstance {

        const headerVals = this.headers.evaluate(variables, ['header'], sessionParamTracker);

        const headers = Object.fromEntries(
            Object.entries(headerVals)
        );

        return new RequestInstance(
            "",
            this.method,
            this.urlPath.evaluate(variables, ['url_path', 'url'], sessionParamTracker),
            headers as Record<string, string>,
            this.query.evaluate(variables, ['query', 'url'], sessionParamTracker),
            this.body.evaluate(variables, ['body'], sessionParamTracker)
        );
    }

    toDict(): Record<string, any> {

        return {
            method: this.method,
            url_path: this.urlPath.toDict(),
            headers: this.headers.toDict(),
            query: this.query.toDict(),
            body: this.body.toDict(),
            variable_names: this.variableNames,
        };
    }

    static fromDict(dict: Record<string, any>): SwapRequestTemplate {

        const method = dict['method'];
        const urlPath = StringTemplate.fromDict(dict['url_path']);
        const headers = DictTemplate.fromDict(dict['headers']);
        const query = DictTemplate.fromDict(dict['query']);
        const body = BodyTemplate.fromDict(dict['body']);

        return new SwapRequestTemplate(method, urlPath, headers, query, body, dict['variable_names']);
    }
}

export class SwapRequest {
    template: SwapRequestTemplate;
    variables: Record<string, SwapVariable>;
    instances: IdType[];

    constructor(
        template: SwapRequestTemplate,
        variables: Record<string, SwapVariable>,
        instances: IdType[]
    ) {
        this.template = template;
        this.variables = variables;
        this.instances = instances;
    }

    evaluate(
        instanceId: IdType,
        instanceRefId: IdType | null,
        variables: Record<string, { where?: string[] }>,
        sessionParamTracker: ParamTracker
    ): RequestInstance {

        let variable_names: string[] = [];

        if (variables === undefined) {
            variable_names = this.template.variableNames;
        }

        if (!instanceRefId && ((variable_names?.length || 0) < this.template.variableNames.length)) {
            throw new Error("All variables must be provided or instance_ref_id must be provided");
        }

        const variablesToSwap: Record<string, { where?: string[] }> = variables || Object.fromEntries(this.template.variableNames.map(name => [name, {}]));

        const variableValues: Record<string, Record<string, { val: string, origin: string }>> = {};

        for (const name of Object.keys(variablesToSwap)) {
            variableValues[name] = variableValues[name] || {};

            const swapWhere = variablesToSwap[name].where || [];

            for (const loc of swapWhere) {
                variableValues[name][loc] = { val: this.variables[name].values[instanceId], origin: "swap" };
            }

            // if `where` is an empty array -> swap it for all locations
            // if `where` is provided but doesn't include `default` -> use the reference for default location
            if (!swapWhere.includes("default")) {

                if (swapWhere.length > 0) variableValues[name]["default"] = { val: this.variables[name].values[instanceRefId ? instanceRefId : instanceId], origin: (instanceRefId ? "ref" : "swap") };
                else variableValues[name]["default"] = { val: this.variables[name].values[instanceId], origin: "swap" };
            }
        }

        if (instanceRefId) {

            for (const name of this.template.variableNames) {
                if (!(name in variablesToSwap)) {
                    variableValues[name] = variableValues[name] || {};
                    variableValues[name]["default"] = { val: this.variables[name].values[instanceRefId], origin: "ref" };
                }
            }
        }

        return this.template.evaluate(variableValues, sessionParamTracker);
    }

    toDict(): Record<string, any> {
        return {
            template: this.template.toDict(),
            variables: Object.fromEntries(
                Object.entries(this.variables).map(([name, variable]) => [name, variable.toDict()])
            ),
            instances: this.instances,
        };
    }

    static fromDict(dict: Record<string, any>): SwapRequest {
        const template = SwapRequestTemplate.fromDict(dict['template']);
        const variables = Object.fromEntries(
            Object.entries(dict['variables']).map(([name, variableDict]) => [name, SwapVariable.fromDict(variableDict as Record<string, any>)])
        );
        return new SwapRequest(template, variables, dict['instances']);
    }
}



// tests

// let swapRequestDict: any = {
//     "template": {
//         "method": "GET",
//         "url_path": {
//             "type": "StringTemplate",
//             "template": "https://example.com/users/(?P<user_id>[^/]+)/transactions",
//             "variable_names": [
//                 "user_id"
//             ],
//             "locked": false
//         },
//         "headers": {
//             "type": "DictTemplate",
//             "entries": [
//                 {
//                     "type": "KeyValTemplate",
//                     "key": {
//                         "type": "StringTemplate",
//                         "template": "Content-Type",
//                         "variable_names": [],
//                         "locked": false
//                     },
//                     "value": {
//                         "type": "StringTemplate",
//                         "template": "application/json",
//                         "variable_names": [],
//                         "locked": false
//                     }
//                 },
//                 {
//                     "type": "KeyValTemplate",
//                     "key": {
//                         "type": "StringTemplate",
//                         "template": "Authorization",
//                         "variable_names": [],
//                         "locked": false
//                     },
//                     "value": {
//                         "type": "StringTemplate",
//                         "template": "Bearer (?P<auth_token>[^/]+)",
//                         "variable_names": [
//                             "auth_token"
//                         ],
//                         "locked": false
//                     }
//                 }
//             ]
//         },
//         "query": {
//             "type": "DictTemplate",
//             "entries": [
//                 {
//                     "type": "KeyValTemplate",
//                     "key": {
//                         "type": "StringTemplate",
//                         "template": "rnd",
//                         "variable_names": [],
//                         "locked": false
//                     },
//                     "value": {
//                         "type": "StringTemplate",
//                         "template": "1934",
//                         "variable_names": [],
//                         "locked": false
//                     }
//                 },
//                 {
//                     "type": "KeyValTemplate",
//                     "key": {
//                         "type": "StringTemplate",
//                         "template": "page",
//                         "variable_names": [],
//                         "locked": false
//                     },
//                     "value": {
//                         "type": "StringTemplate",
//                         "template": "(?P<page_index>[^/]+)",
//                         "variable_names": [
//                             "page_index"
//                         ],
//                         "locked": false
//                     }
//                 }
//             ]
//         },
//         "body": {
//             "type": "StringTemplate",
//             "template": "{\"user_id\": \"(?P<user_id>[^/]+)\"}",
//             "variable_names": [
//                 "user_id"
//             ],
//             "locked": false
//         },
//         "variable_names": [
//             "user_id",
//             "page_index",
//             "auth_token"
//         ]
//     },
//     "variables": {
//         "user_id": {
//             "values": {
//                 "A": "u293840",
//                 "B": "u239489"
//             }
//         },
//         "page_index": {
//             "values": {
//                 "A": "1",
//                 "B": "2"
//             }
//         },
//         "auth_token": {
//             "values": {
//                 "A": "1234",
//                 "B": "2492"
//             }
//         }
//     },
//     "instances": [
//         "A",
//         "B"
//     ]
// }


// let swapRequest = SwapRequest.fromDict(swapRequestDict);

// console.log(swapRequest)
// console.log(swapRequest.evaluate("B", "A", { "user_id": { "where": ["default"] }, "page_index": { "where": ["default"] }, "auth_token": { "where": ["default"] } }, new ParamTracker()));
// console.log(swapRequest.evaluate("B", "A", { "user_id": { "where": ["default"] } }, new ParamTracker()));

// console.log("JSON Body encoding");

// swapRequestDict = {
//     "template": {
//         "method": "GET",
//         "url_path": {
//             "type": "StringTemplate",
//             "template": "https://example.com/users/(?P<user_id>[^/]+)/transactions",
//             "variable_names": [
//                 "user_id"
//             ],
//             "locked": false
//         },
//         "headers": {
//             "type": "DictTemplate",
//             "entries": [
//                 {
//                     "type": "KeyValTemplate",
//                     "key": {
//                         "type": "StringTemplate",
//                         "template": "Content-Type",
//                         "variable_names": [],
//                         "locked": false
//                     },
//                     "value": {
//                         "type": "StringTemplate",
//                         "template": "application/json",
//                         "variable_names": [],
//                         "locked": false
//                     }
//                 },
//                 {
//                     "type": "KeyValTemplate",
//                     "key": {
//                         "type": "StringTemplate",
//                         "template": "Authorization",
//                         "variable_names": [],
//                         "locked": false
//                     },
//                     "value": {
//                         "type": "StringTemplate",
//                         "template": "Bearer (?P<auth_token>[^/]+)",
//                         "variable_names": [
//                             "auth_token"
//                         ],
//                         "locked": false
//                     }
//                 }
//             ]
//         },
//         "query": {
//             "type": "DictTemplate",
//             "entries": [
//                 {
//                     "type": "KeyValTemplate",
//                     "key": {
//                         "type": "StringTemplate",
//                         "template": "rnd",
//                         "variable_names": [],
//                         "locked": false
//                     },
//                     "value": {
//                         "type": "StringTemplate",
//                         "template": "1934",
//                         "variable_names": [],
//                         "locked": false
//                     }
//                 },
//                 {
//                     "type": "KeyValTemplate",
//                     "key": {
//                         "type": "StringTemplate",
//                         "template": "page",
//                         "variable_names": [],
//                         "locked": false
//                     },
//                     "value": {
//                         "type": "StringTemplate",
//                         "template": "(?P<page_index>[^/]+)",
//                         "variable_names": [
//                             "page_index"
//                         ],
//                         "locked": false
//                     }
//                 }
//             ]
//         },
//         "body": {
//             "type": "BodyTemplate",
//             "template": {
//                 "type": "DictTemplate",
//                 "entries": [
//                     {
//                         "type": "KeyValTemplate",
//                         "key": {
//                             "type": "StringTemplate",
//                             "template": "user_id",
//                             "variable_names": [],
//                             "locked": false
//                         },
//                         "value": {
//                             "type": "StringTemplate",
//                             "template": "(?P<user_id>[^/]+)",
//                             "variable_names": [
//                                 "user_id"
//                             ],
//                             "locked": false
//                         }
//                     }
//                 ]
//             },
//             "encoding": "json",
//             "variable_names": [
//                 "user_id"
//             ],
//             "locked": false
//         },
//         "variable_names": [
//             "user_id",
//             "page_index",
//             "auth_token"
//         ]
//     },
//     "variables": {
//         "user_id": {
//             "values": {
//                 "A": "u293840",
//                 "B": "u239489"
//             }
//         },
//         "page_index": {
//             "values": {
//                 "A": "1",
//                 "B": "2"
//             }
//         },
//         "auth_token": {
//             "values": {
//                 "A": "1234",
//                 "B": "2492"
//             }
//         }
//     },
//     "instances": [
//         "A",
//         "B"
//     ]
// }

// swapRequest = SwapRequest.fromDict(swapRequestDict);

// console.log(swapRequest)
// console.log(swapRequest.evaluate("B", "A", { "user_id": { "where": ["default"] }, "page_index": { "where": ["default"] }, "auth_token": { "where": ["default"] } }, new ParamTracker()));
// console.log(swapRequest.evaluate("B", "A", { "user_id": { "where": ["default"] } }, new ParamTracker()));

// // test for FORM Body encoding
// console.log("Form Body encoding");

// swapRequest.template.body.encoding = BodyEncoding.FORM;

// console.log(swapRequest)
// console.log(swapRequest.evaluate("B", "A", { "user_id": { "where": ["default"] }, "page_index": { "where": ["default"] }, "auth_token": { "where": ["default"] } }, new ParamTracker()));
// console.log(swapRequest.evaluate("B", "A", { "user_id": { "where": ["default"] } }, new ParamTracker()));

// // test for URL_ENCODED_FORM Body encoding
// console.log("URL Encoded Form Body encoding");

// swapRequest.template.body.encoding = BodyEncoding.URL_ENCODED_FORM;

// console.log(swapRequest)
// console.log(swapRequest.evaluate("B", "A", { "user_id": { "where": ["default"] }, "page_index": { "where": ["default"] }, "auth_token": { "where": ["default"] } }, new ParamTracker()));
// console.log(swapRequest.evaluate("B", "A", { "user_id": { "where": ["default"] } }, new ParamTracker()));

// // test for URL_ENCODED_JSON Body encoding
// console.log("URL Encoded JSON Body encoding");

// swapRequest.template.body.encoding = BodyEncoding.URL_ENCODED_JSON;

// console.log(swapRequest)
// console.log(swapRequest.evaluate("B", "A", { "user_id": { "where": ["default"] }, "page_index": { "where": ["default"] }, "auth_token": { "where": ["default"] } }, new ParamTracker()));
// console.log(swapRequest.evaluate("B", "A", { "user_id": { "where": ["default"] } }, new ParamTracker()));

// // test for BASE64_JSON Body encoding
// console.log("Base64 JSON Body encoding");

// swapRequest.template.body.encoding = BodyEncoding.BASE64_JSON;

// console.log(swapRequest)
// console.log(swapRequest.evaluate("B", "A", { "user_id": { "where": ["default"] }, "page_index": { "where": ["default"] }, "auth_token": { "where": ["default"] } }, new ParamTracker()));
// console.log(swapRequest.evaluate("B", "A", { "page_index": { "where": ["default"] } }, new ParamTracker()));