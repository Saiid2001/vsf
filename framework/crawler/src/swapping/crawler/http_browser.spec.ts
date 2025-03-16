import { beforeEach, describe, it } from 'node:test';
import HttpBrowser from './http_browser.js';
import { expect } from 'playwright/test';

describe('HttpBrowser', () => {
    let browser: HttpBrowser;

    beforeEach(() => {
        browser = new HttpBrowser();
    });

    it('should return the correct browser name', () => {
        const browserType = browser.browserType();
        expect(browserType.name()).toBe('HttpBrowser');
    });

    it('should return the correct version', () => {
        expect(browser.version()).toBe('1.0.0');
    });

    it('should create a new context', () => {
        expect(() => browser.newContext({})).not.toThrow();
    });

    it('should close the browser without errors', async () => {
        await expect(browser.close()).resolves.toBeUndefined();
    });
});

describe('HttpBrowserContext', () => {
    let browser: HttpBrowser;
    let context: any;

    beforeEach(async () => {
        browser = new HttpBrowser();
        context = await browser.newContext({});
    });

    it('should create a new page', async () => {
        expect(() => context.newPage()).not.toThrow();
    });

    it('should close the context without errors', async () => {
        await expect(context.close()).resolves.toBeUndefined();
    });
});

const requestDicts = [{
    instance_id: '',
    method: 'GET',
    url: 'https://st-eu.dynamicyield.com/spa/json?sec=9876584&id=7331861157159083574&jsession=o6fmd39wf9r817irgth73de9bnndm48f&isSesNew=true&ctx=%7B%22type%22%3A%22OTHER%22%2C%22lng%22%3A%22de_DE%22%7D',
    url_path: 'https://st-eu.dynamicyield.com/spa/json',
    headers: {
        priority: 'u=1, i',
        origin: 'https://www.deichmann.com',
        referer: 'https://www.deichmann.com/',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Linux"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'cross-site',
        'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
        ':authority': 'st-eu.dynamicyield.com',
        ':method': 'GET',
        ':path': '%2Fspa%2Fjson%3Fsec=9876584&id=7331861157159083574&ref=&jsession=o6fmd39wf9r817irgth73de9bnndm48f&isSesNew=true&ctx=%7B%22type%22%3A%22OTHER%22%2C%22lng%22%3A%22de_DE%22%7D',
        ':scheme': 'https',
        accept: '*/*',
        'accept-encoding': 'gzip, deflate, br, zstd',
        'accept-language': 'en-US,en;q=0.9',
        'content-type': 'text/plain; charset=utf-8',
        'sec-ch-ua': '"Chromium";v="127", "Not)A;Brand";v="99"'
    },
    query: {
        sec: ['9876584'],
        id: ['7331861157159083574'],
        jsession: ['o6fmd39wf9r817irgth73de9bnndm48f'],
        isSesNew: ['true'],
        ctx: ['{"type":"OTHER","lng":"de_DE"}']
    },
    body: ''
},
{
    instance_id: '',
    method: 'POST',
    url: 'https://direct.dy-api.eu/v2/serve/user/choose?',
    url_path: 'https://direct.dy-api.eu/v2/serve/user/choose',
    headers: {
        accept: 'application/json, text/plain, */*',
        'dy-api-key': '24d0a7a28dbe07d0f1ea5c61ee78c811ec50da552b5c5dbc081a3281a0ce1dab',
        'sec-ch-ua-platform': '"Linux"',
        'sec-fetch-dest': 'empty',
        'accept-language': 'en-US,en;q=0.9',
        origin: 'https://www.deichmann.com',
        priority: 'u=1, i',
        referer: 'https://www.deichmann.com/',
        'sec-ch-ua-mobile': '?0',
        'accept-encoding': 'gzip, deflate, br, zstd',
        'sec-ch-ua': '"Chromium";v="127", "Not)A;Brand";v="99"',
        ':path': '/v2/serve/user/choose',
        ':scheme': 'https',
        'content-type': 'application/json',
        'sec-fetch-mode': 'cors',
        'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
        ':authority': 'direct.dy-api.eu',
        'content-length': '552',
        ':method': 'POST',
        'sec-fetch-site': 'cross-site'
    },
    query: {},
    body: '{"user":{"dyid":"7331861157159083574","dyid_server":"7331861157159083574"},"session":{"dy":"o6fmd39wf9r817irgth73de9bnndm48f"},"selector":{"names":["ProductListWithBanner"]},"context":{"page":{"location":"https://www.deichmann.com/de-de/schuhe/c-ds","type":"CATEGORY","data":["Home","Schuhe"]},"pageAttributes":{"api_basestoreId":"deichmann-de","api_categoryCode":"default-shoes","api_productCategory":{"allLevels":"Schuhe, Home","firstLevel":"Schuhe","secondLevel":"Home"}}},"options":{"returnAnalyticsMetadata":null,"isImplicitImpressionMode":null}}'
}]

const requestDictWithIncorrectContentLength = {
    "instance_id": "",
    "method": "POST",
    "url": "https://httpbin.org/post",
    "url_path": "https://httpbin.org/post",
    "headers": {
        "accept": "application/json, text/plain, */*",
        "content-type": "application/json",
        "content-length": "100",
        "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
        "accept-encoding": "gzip, deflate, br, zstd",
        "accept-language": "en-US,en;q=0.9",
        "sec-ch-ua": "\"Chromium\";v=\"127\", \"Not)A;Brand\";v=\"99\"",
        ":path": "/post",
        ":scheme": "https",
        ":method": "POST",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "cross-site",
        "sec-ch-ua-platform": "\"Linux\"",
        "sec-ch-ua-mobile": "?0",
    },
    "query": {},
    "body": "{\"key\":\"value\"}"
  }

describe('HttpBrowserPage', () => {
    let page: any;

    beforeEach(async () => {
        const browser = new HttpBrowser();
        const context = await browser.newContext({});
        page = await context.newPage();
    });

    it('should navigate to a URL', async () => {
        console.log(page, page.goto)
        await expect(page.goto('http://example.com', {})).resolves.toBeUndefined();
    });

    it('should wait for a timeout', async () => {
        const start = Date.now();
        await page.waitForTimeout(100);
        const end = Date.now();
        expect(end - start).toBeGreaterThanOrEqual(100);
    });

    it('should close the page without errors', async () => {
        await expect(page.close()).resolves.toBeUndefined();
    });

    it('should fetch a URL', async () => {
        const response = await page.fetch('http://example.com', {
            method: 'GET',
            headers: {},
            body: null
        });
        expect(response.status).toBe(200);
        expect(response.url).toBe('http://example.com');
    });

    it('should fetch a URL with a body', async () => {
        const response = await page.fetch('http://httpbin.org/post', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: 'value' })
        });

        expect(response.status).toBe(200);
        expect(response.url).toBe('http://httpbin.org/post');
        expect(JSON.parse(response.body).data).toBe('{"key":"value"}');
    });

    it('should fetch a URL with headers', async () => {
        const response = await page.fetch('http://httpbin.org/headers', {
            method: 'GET',
            headers: { 'X-Test': 'test' },
            body: null
        });

        expect(response.status).toBe(200);
        expect(response.url).toBe('http://httpbin.org/headers');
        expect(JSON.parse(response.body).headers['X-Test']).toBe('test');
    });

    it('should fetch a URL with a status code', async () => {
        const response = await page.fetch('http://httpbin.org/status/404', {
            method: 'GET',
            headers: {},
            body: null
        });

        expect(response.status).toBe(404);
        expect(response.statusText).toBe('NOT FOUND');
    });

    it('should fetch a URL with cookies', async () => {
        const response = await page.fetch('http://httpbin.org/cookies', {
            method: 'GET',
            headers: {},
            body: null
        });

        expect(response.status).toBe(200);
        expect(response.url).toBe('http://httpbin.org/cookies');
        expect(JSON.parse(response.body).cookies).toEqual({});
    });

    it('should be able to send a cookie', async () => {

        const response = await page.fetch('http://httpbin.org/cookies', {
            method: 'GET',
            headers: { 'Cookie': 'name=value' },
            body: null
        });

        expect(response.status).toBe(200);
        expect(response.url).toBe('http://httpbin.org/cookies');
        expect(JSON.parse(response.body).cookies).toEqual({ 'name': 'value' });

    });

    it('should be able to send example requests', async () => {

        for (const requestDict of requestDicts) {

            expect(async () => {
                const response = await page.fetch(requestDict.url, {
                    method: requestDict.method,
                    headers: requestDict.headers,
                    body: requestDict.body
                });

            }).not.toThrow();


        }
    }
    );

    it('should be able to receive a response with image data', async () => {
        const response = await page.fetch('https://httpbin.org/image/png', {
            method: 'GET',
            headers: {},
            body: null
        });

        expect(response.status).toBe(200);
        expect(response.url).toBe('https://httpbin.org/image/png');
        expect(response.body).toContain("PNG");
    }
    );


    it('should fix the content-length header if it is incorrect', async () => {
        const response = await page.fetch(requestDictWithIncorrectContentLength.url, {
            method: requestDictWithIncorrectContentLength.method,
            headers: requestDictWithIncorrectContentLength.headers,
            body: requestDictWithIncorrectContentLength.body
        });

        expect(response.status).toBe(200);
        expect(response.url).toBe(requestDictWithIncorrectContentLength.url);
    }
    );

    it('should be able to send a request with a large body', async () => {
        const body = 'a'.repeat(100000000);
        const response = await page.fetch('https://httpbin.org/post', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body
        });

        expect(response.status).toBe(200);
        expect(response.url).toBe('https://httpbin.org/post');
        // expect(response.body).toBe(body);
    }
    );


});


