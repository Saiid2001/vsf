"use client";

import React, { useState } from 'react';

interface ObjectViewerProps {
    data: Record<string, any>;
    contentType?: string;
}

const renderSummary = (data: Record<string, any>) => {
    const dataStr = JSON.stringify(data);
    return dataStr.length > 100 ? dataStr.slice(0, 50) + '...' : dataStr;
};

const IframeSandboxed = (props: { srcDoc: string, className: string }) => {

    const [viewRaw, setViewRaw] = useState(false);
    const metaTag = '<meta http-equiv="Content-Security-Policy" content="connect-src http://goodsite.com http://different-goodsite.com">';

    let srcDoc = props.srcDoc.replace(/<head>/, '<head>' + metaTag);

    // prevent scripts from running
    // prevent form submission
    // prevent requests

    // replace all the srcs with a proxy
    srcDoc = srcDoc.replace(/src="http/g, 'srcx="bad/http');

    // drop scripts
    srcDoc = srcDoc.replace(/<script/g, '<!--script');
    srcDoc = srcDoc.replace(/<\/script>/g, '</script-->');

    // include style to make background white and text black
    if (!srcDoc.includes('<style>') && !srcDoc.includes('<link')) {
        srcDoc = "<style>body { background: white!important; color: black!important; }</style>" + srcDoc;
    } 
    // else {
    //     srcDoc = srcDoc.replace(/<\/head>/, '<style>body { background: white!important; color: black!important; }</style></head>');
    // } 

    if (viewRaw) {
        return (
            <div>
                <button onClick={() => setViewRaw(false)} className='btn'>Render</button>
                <div className='font-mono text-gray-400 p-2 my-2 border-gray-600 border'>
                    {srcDoc.split('\n').map((line, i) => (
                        <div key={i} className='break-all'>{line}</div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div>
            <button onClick={() => setViewRaw(true)} className='btn'>Raw</button>
            <iframe srcDoc={srcDoc} className={props.className} sandbox='allow-scripts allow-forms allow-same-origin'>
            </iframe>
        </div>
    );
}

// TODO: can't seem to decode the image properly. 
const ImageFromText = (props: { src: string, contentType: string }) => {

    const buffer = Buffer.from(props.src, 'utf-8');
    const base64 = buffer.toString('base64');
    const src = `data:${props.contentType};base64,${base64}`;

    return (
        <img src={src}

            className='w-full h-96 object-cover'
        />
    );

}

export const ObjectInlineViewer: React.FC<ObjectViewerProps> = ({ data, contentType }) => {
    const dataTxt: string = data instanceof Object ? JSON.stringify(data, null, 2) : data;

    let JSONParseFailed = false;
    try {
        JSON.parse(dataTxt);
    } catch (e) {
        JSONParseFailed = true;
    }

    // TODO: some sites are really not fun to look to
    const isHTML = JSONParseFailed && (dataTxt.includes('<!DOCTYPE html>') || dataTxt.includes('<html') || dataTxt.includes("<") && dataTxt.includes("</"));
    const isImage = contentType?.includes('image');
    // const isHTML = false;


    return (
        <div className='font-mono text-gray-400 p-2 my-2 border-gray-600 border'>

            {isHTML ? (
                <IframeSandboxed srcDoc={dataTxt} className='w-full h-96'></IframeSandboxed>
            ) : (
                dataTxt.split('\n').map((line, i) => (
                    <div key={i} className='break-all'>{line}</div>
                ))
            )}
        </div>
    );
}

const JSONViewer: React.FC<ObjectViewerProps> = ({ data }) => {
    const [showModal, setShowModal] = useState(false);

    const handleShow = () => setShowModal(true);
    const handleClose = () => setShowModal(false);

    return (
        <div>
            <div className='font-mono text-xs text-gray-400'>
                {renderSummary(data)}

                {JSON.stringify(data).length > 100 && (
                    <button onClick={handleShow} className='text-blue-400 p-1 inline-block'>&#8594;</button>
                )}
            </div>

            {showModal && (
                <div className='fixed top-0 left-0 w-full h-full bg-white bg-opacity-90 flex flex-col items-start justify-center text-black max-h-screen'>
                    <div className='m-8 p-8 bg-white border border-black mx-auto min-w-72 max-h-screen max-w-full rounded'>
                        <div className='flex justify-between gap-2'>
                            <button onClick={handleClose} className='btn'>X</button>
                            <button onClick={() => navigator.clipboard.writeText(JSON.stringify(data, null, 2))} className='btn'>Copy</button>
                        </div>
                        <div className='max-h-full overflow-scroll p-2 m-2 bg-slate-50 rounded'>
                            <pre>{JSON.stringify(data, null, 2)}</pre>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default JSONViewer;