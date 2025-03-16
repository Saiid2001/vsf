import http from 'node:http';
import https from 'node:https';
import { curly } from 'node-libcurl';
type HttpResponse = {
    status: number,
    statusText: string,
    body: string,
    url: string,
    headers: { [key: string]: string }
}
class HttpBrowser {

    browserType() {
        return {
            name: () => "HttpBrowser",
        }
    }

    version() {
        return "1.0.0";
    }

    async newContext(data: any) {
        return new HttpBrowserContext();
    }

    async close() {

    }

}

class HttpBrowserContext {

    async newPage() {
        return new HttpBrowserPage();
    }

    async close() {

    }

}

class HttpBrowserPage {

    on(event: string, callback: Function) {
    }

    async goto(url: string, options: any) {

    }

    async waitForTimeout(milliseconds: number) {
        return new Promise((resolve) => {
            setTimeout(resolve, milliseconds);
        }
        )
    }

    async close() {

    }

    // DEV: To deprecate
    async _fetchHttp(url: string, options: {
        method: string,
        headers: any,
        body: any
    }): Promise<HttpResponse> {
        return new Promise((resolve, reject) => {

            const req = http.request(url, {
                method: options.method || 'GET',
                headers: options.headers || {}
            }, (res) => {
                res.setEncoding('utf8');
                let body = '';

                res.on('data', (chunk) => {
                    body += chunk;
                });

                res.on('end', () => {
                    resolve({
                        status: res.statusCode || 0,
                        statusText: res.statusMessage || '',
                        body: body,
                        url: url,
                        headers: res.headers as { [key: string]: string }
                    })
                });

                res.on('error', (err) => {
                    console.error(err);
                    reject(err);
                });
            }
            )

            req.on('error', (e) => {
                console.error(e);
                reject(e);
            });

            req.write(options.body || '');

            req.end();

        });
    }

    // DEV: to deprecate
    async _fetchHttps(url: string, options: {
        method: string,
        headers: any,
        body: any
    }): Promise<HttpResponse> {
        return new Promise((resolve, reject) => {

            const req = https.request(url, {
                method: options.method || 'GET',
                headers: options.headers || {}
            }, (res) => {
                res.setEncoding('utf8');
                let body = '';

                res.on('data', (chunk) => {
                    body += chunk;
                });

                res.on('end', () => {
                    resolve({
                        status: res.statusCode || 0,
                        statusText: res.statusMessage || '',
                        body: body,
                        url: url,
                        headers: res.headers as { [key: string]: string }
                    })
                });

                res.on('error', (err) => {
                    console.error(err);
                    reject(err);
                });
            }
            )

            req.on('error', (e) => {
                console.error(e);
                reject(e);
            });

            req.write(options.body || '');

            req.end();

        });
    }

    async _fetchWithLibCurl(url: string, options: {
        method: string,
        headers: any,
        body: any
    }): Promise<HttpResponse> {
        return new Promise((resolve, reject) => {


            const curlFunc: any = {
                'GET': curly.get,
                'get': curly.get,
                'POST': curly.post,
                'post': curly.post,
                'PUT': curly.put,
                'put': curly.put,
                'PATCH': curly.patch,
                'patch': curly.patch,
                'DELETE': curly.delete,
                'delete': curly.delete
            }

            // make sure the content length is consistent with body
            const contentLength = options.body ? Buffer.byteLength(options.body) : 0;
            options.headers = options.headers || {};
            options.headers['content-length'] = contentLength;

            curlFunc[options.method](url, {
                httpHeader: Object.entries(options.headers || {}).map(([key, value]) => `${key}: ${value}`),
                ...(options.body ? { postFields: options.body } : {}),

                // error handling for bad APIs in parsing
                curlyResponseBodyParsers: {
                    'application/json': (data: any) => {
                        const dataStr = data.toString()

                        if (dataStr.length === 0) {
                            return {}
                        }

                        // error handling for html for bad APIs
                        if (dataStr.startsWith('<html>') || dataStr.startsWith('<!DOCTYPE')) {
                            return dataStr
                        }

                        return JSON.parse(data)
                    }
                },
                ACCEPT_ENCODING: options.headers['accept-encoding'] || 'gzip, deflate, br'
            }).then((response: any) => {

                // process response body
                // check if body is binary

                let response_data = null;

                if (response.data instanceof Buffer) {
                    response_data = response.data.toString('utf-8');
                }
                else if (response.data instanceof Object) {
                    response_data = JSON.stringify(response.data);
                }
                else {
                    response_data = response.data;
                }

                resolve({
                    status: response.statusCode,
                    statusText: response.headers[0].result.reason,
                    body: response_data,
                    url: url,
                    headers: response.headers[0]
                });

            }).catch((error: any) => {
                reject(error);
            }
            );

        });
    }

    async fetch(url: string, options: {
        method: string,
        headers: any,
        body: any
    }): Promise<HttpResponse> {
        return this._fetchWithLibCurl(url, options);

    }

}


export default HttpBrowser;