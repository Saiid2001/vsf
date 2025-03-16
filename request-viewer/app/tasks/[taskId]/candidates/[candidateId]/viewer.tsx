"use client";
import JSONViewer, { ObjectInlineViewer } from "@/app/common/JSONViewer";
import { dbQueries } from "@/db";
import { useEffect, useState } from "react";

function headerAllowed(header: any) {

    return !header.name.startsWith(":") && !header.name.startsWith("sec-") && !header.name.startsWith("referer") && !header.name.startsWith("accept-encoding")

}

function RequestResponseView(props: {
    request: Record<string, any>,
    requestHeaders: Record<string, any>,
    response: Record<string, any>,
    responseHeaders: Record<string, any>,
    tag: string,
    openSections: any,
    onToggleSection: (section: string) => void
}) {

    const [openSections, setOpenSections] = useState<any>(props.openSections);

    function handleToggleSection(section: string) {

        // only toggle the section if initiated by the user not from props
        if (openSections[section] === props.openSections[section]) {
            props.onToggleSection(section);
        }
    }

    useEffect(() => {
        setOpenSections(props.openSections);
    }
        , [props.openSections])

    return <div className="border-2 border-gray-600 p-4">

        <h2>{props.tag} Instance</h2>
        <table className="w-fit my-4 border-collapse">
            <tbody>

            </tbody>
        </table>
        <h3>Request</h3>
        <table className="w-fit my-4 border-collapse">
            <tbody>
                <tr>
                    <td className="px-2 border-y-2 font-bold">ID</td>
                    <td className="px-2 border-y-2">{props.request.request_id}</td>
                </tr>
                <tr>
                    <td className="px-2 border-y-2 font-bold">URL</td>
                    <td className="px-2 border-y-2 break-all">{props.request.url}</td>
                </tr>
            </tbody>
        </table>

        {props.request.params.length > 0 && (
            <details open={props.openSections.request_params} onToggle={() => handleToggleSection('request_params')}>
                <summary><h4 className='inline text-blue-500 font-bold'>Query Params</h4></summary>
                <table className="w-fit my-4 border-collapse">
                    <thead>
                        <tr>
                            <th className="px-2">Key</th>
                            <th className="px-2">Value</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Object.entries(props.request.params).map(([key, value]) => (
                            <tr key={key} className="border-y-2">
                                <td>{key}</td>
                                <td>{value}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </details>
        )}
        {props.requestHeaders.length > 0 && (
            <details open={props.openSections.request_headers} onToggle={() => handleToggleSection('request_headers')}>
                <summary><h4 className='inline text-blue-500 font-bold'>Headers</h4></summary>
                <table className=" w-fit my-4 border-collapse">
                    <thead>
                        <tr>
                            <th className="px-2">Key</th>
                            <th className="px-2">Value</th>
                        </tr>
                    </thead>
                    <tbody>
                        {props.requestHeaders.filter(header => headerAllowed(header)).map((header: any) => (
                            <tr key={header.name} className="border-y-2">
                                <td>{header.name}</td>
                                <td className="break-all">{header.value}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </details>
        )}

        {props.request.body && (

            <details open={props.openSections.request_body} onToggle={() => handleToggleSection('request_body')}>
                <summary><h4 className='inline text-blue-500 font-bold'>Body</h4></summary>
                <ObjectInlineViewer data={props.request.body} />
            </details>
        )}

        <hr className="my-4 border-4 border-gray-600" />

        <h3>Response</h3>

        <table className="w-fit my-4 border-collapse">
            <tbody>
                <tr>
                    <td className="px-2 border-y-2 font-bold">Status Code</td>
                    <td className="px-2 border-y-2">{props.response.status_code}</td>
                </tr>
                <tr>
                    <td className="px-2 border-y-2 font-bold">Status Line</td>
                    <td className="px-2 border-y-2 break-all">{props.response.status_line}</td>
                </tr>
                <tr>
                    <td className="px-2 border-y-2 font-bold">Body Hash</td>
                    <td className="px-2 border-y-2 break-all">{props.response.hash}</td>
                </tr>
            </tbody>
        </table>

        {props.responseHeaders.length > 0 && (
            <details open={props.openSections.response_headers} onToggle={() => handleToggleSection('response_headers')}>
                <summary><h4 className='inline text-blue-500 font-bold'>Headers</h4></summary>
                <table className="w-fit my-4 border-collapse">
                    <thead>
                        <tr>
                            <th className="px-2">Key</th>
                            <th className="px-2">Value</th>
                        </tr>
                    </thead>
                    <tbody>
                        {props.responseHeaders.filter(header => headerAllowed(header)).map((header: any) => (
                            <tr key={header.name} className="border-y-2">
                                <td>{header.name}</td>
                                <td className="break-all">{header.value}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </details>
        )}

        {props.response.body && (
            <details open={props.openSections.response_body} onToggle={() => handleToggleSection('response_body')}>
                <summary><h4 className='inline text-blue-500 font-bold'>Body</h4></summary>
                <ObjectInlineViewer data={props.response.body} contentType={props.responseHeaders.find((header: any) => header.name.toLowerCase() === 'content-type')?.value} />
            </details>
        )}

    </div>

}

export default function SideBySideViewer(
    props: {
        candidate: any,
        task: any,
        objs: { tag: string, request: any, response: any, requestHeaders: any, responseHeaders: any }[],
        initialVisiblePanes: any
    }
) {

    const [visiblePanes, setVisiblePanes] = useState<any>(props.initialVisiblePanes);

    const [openSections, setOpenSections] = useState<any>({
        request_params: true,
        response_params: true,
        request_headers: true,
        response_headers: true,
        request_body: true,
        response_body: true
    });

    const visibleObjs = props.objs.filter(obj => visiblePanes[obj.tag]);

    return (
        <>
            <div className="my-4 border-2 border-gray-600 p-4">
                <i className="inline text-gray">Visible Panes: </i>
                {Object.entries(visiblePanes).filter(tag=>props.objs.filter( obj => obj.tag == tag[0]).length).map(([key, value]) => (
                    <label key={key} className="inline-block mx-2">
                        <input type="checkbox" checked={value} onChange={() => setVisiblePanes({ ...visiblePanes, [key]: !visiblePanes[key] })} />
                        {key}
                    </label>
                ))}

            </div>

            <div className={`grid ` + (visibleObjs.length > 2 ? `grid-cols-3` : (visibleObjs.length > 1 ? `grid-cols-2` : `grid-cols-1`))}>

                {visibleObjs.map((obj, i) => (
                    <RequestResponseView key={i}  {...obj} openSections={openSections} onToggleSection={(section) => setOpenSections({ ...openSections, [section]: !openSections[section] })}
                    />
                ))}


            </div>
        </>
    )

}