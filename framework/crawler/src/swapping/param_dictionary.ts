/*
We want to keep track of encountered parameters from the requests to try to get fresh counterparts for the parameters we already have

For each parameter name 
 - we can have multiple value
    - each value should be indexed by the time encountered, request path, location, and encoding

Limitations
 - parameters inside the path are not considered
 - dynamic parameters that depend on client side logic are not considered
 - parameters in cookies are not considered
*/

// import { chromium, Request, Response } from "playwright-core"

interface Request {
    url(): string
    headersArray(): Promise<{ name: string, value: string }[]>
    postDataJSON(): any
}

interface Response {
    url(): string
    headersArray(): Promise<{ name: string, value: string }[]>
    body(): Promise<Buffer>
    allHeaders(): Promise<{ [key: string]: string }>
}

export enum ParamLocation {
    REQUEST_QUERY = "REQUEST_QUERY",
    REQUEST_BODY = "REQUEST_BODY",
    REQUEST_HEADER = "REQUEST_HEADER",
    RESPONSE_BODY = "RESPONSE_BODY",
    RESPONSE_HEADER = "RESPONSE_HEADER",
}

type ParamValue = {
    value: any,
    time: number,
    location: ParamLocation,
    requestPath: string,
}

type ParamValueWithCounter = ParamValue & {
    changesCounter: number
}

class TrackedParam {
    name: string
    latestValue?: ParamValueWithCounter
    latestByPath: Record<string, ParamValueWithCounter>
    time: number

    constructor(name: string) {
        this.name = name
        this.latestByPath = {}
        this.time = 0
    }

    addValue(value: ParamValue) {

        if (this.latestValue === undefined || this.latestValue.time < value.time) {
            this.latestValue = { ...value, changesCounter: this.latestValue ? this.latestValue.changesCounter + 1 : 0 }
        }

        if (this.latestByPath[value.requestPath]) {
            const latest = this.latestByPath[value.requestPath]
            if (!latest || latest.time < value.time) {
                this.latestByPath[value.requestPath] = { ...value, changesCounter: latest.changesCounter + 1 }
            }
        } else {
            this.latestByPath[value.requestPath] = { ...value, changesCounter: 0 }
        }
    }
}

function flattenDict(dict: Record<string, any>, prefix?: string) {
    const result: Record<string, any> = {}

    if (!dict) {
        return result
    }

    for (const [key, value] of Object.entries(dict)) {
        if (typeof value === "object") {
            const nested = prefix ? flattenDict(value, `${prefix}.${key}`) : flattenDict(value, key)

            if (!nested) {
                result[prefix ? `${prefix}.${key}` : key] = value
            }

            for (const [nestedKey, nestedValue] of Object.entries(nested)) {
                result[nestedKey] = nestedValue
            }
        } else {
            result[prefix ? `${prefix}.${key}` : key] = value
        }
    }
    return result
}

export const ALWAYS_FRESH = [
    "authorization",
    "cookie",
    "jwt",
    "csrf",
    "session",
    "auth"
]


export class ParamTracker {

    trackedParams: Record<string, TrackedParam>

    constructor() {
        this.trackedParams = {}
    }

    addParam(name: string, value: ParamValue) {
        if (!this.trackedParams[name]) {
            this.trackedParams[name] = new TrackedParam(name)
        }
        this.trackedParams[name].addValue(value)
    }

    getLatestValue(name: string) {
        return this.trackedParams[name]?.latestValue
    }

    getLatestByPath(name: string, path: string) {
        return this.trackedParams[name].latestByPath[path]
    }

    async trackFromRequest(request: Request) {
        const url = new URL(request.url())
        const path = url.hostname + url.pathname
        const time = Date.now()

        if (url.searchParams) {
            for (const [name, value] of Object.entries(url.searchParams)) {
                this.addParam(name, { value, time, location: ParamLocation.REQUEST_QUERY, requestPath: path })
            }
        }


        for (const { name, value } of (await request.headersArray())) {

            if (name.includes("uthoriz")) {
                console.log(name, value)
            }

            this.addParam(name, { value, time, location: ParamLocation.REQUEST_HEADER, requestPath: path })
        }

        try {

            const body = request.postDataJSON()

            if (body) {

                for (const [name, value] of Object.entries(flattenDict(body))) {
                    this.addParam(name, { value, time, location: ParamLocation.REQUEST_BODY, requestPath: path })
                }
            }
        }
        catch (e) {
            console.log(e)
        }

    }

    async trackFromResponse(response: Response) {
        const url = new URL(response.url())
        const path = url.hostname + url.pathname
        const time = Date.now()
        for (const { name, value } of (await response.headersArray())) {
            this.addParam(name, { value, time, location: ParamLocation.RESPONSE_HEADER, requestPath: path })
        }

        try {


            let body = null;

            // redirect response does not have body
            try {
                body = await response.body()
            } catch (e) {
                console.log(e)
            }

            const contentType = (await response.allHeaders())["content-type"]

            if (body && contentType && contentType.includes("application/json")) {
                const json = flattenDict(JSON.parse(body.toString()))

                for (const [name, value] of Object.entries(json)) {
                    this.addParam(name, { value, time, location: ParamLocation.RESPONSE_BODY, requestPath: path })
                }
            }

            else if (body && contentType && contentType.includes("application/x-www-form-urlencoded")) {
                const form = flattenDict(new URLSearchParams(body.toString()))

                for (const [name, value] of form.entries()) {
                    this.addParam(name, { value, time, location: ParamLocation.RESPONSE_BODY, requestPath: path })
                }
            }

        } catch (e) {
            console.log(e)
        }

        // TODO: handle other content types
    }

}
