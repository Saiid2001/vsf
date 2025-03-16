import JSONViewer from "@/app/common/JSONViewer";
import { dbQueries } from "@/db";
import SideBySideViewer from "./viewer";
// import { CandidateQues } from "./ques";


export default async function CandidateView({ params }: {
    params: { taskId: string, candidateId: string }
}) {

    const candidate = await dbQueries.getCandidate(params.candidateId);

    const expRequests = await dbQueries.getSwapRequest(params.candidateId);

    const refRequest = expRequests.find((req: any) => req.tag === 'ref');
    const swapRequest = expRequests.find((req: any) => req.tag === 'swap');

    const userdiffCandidate = await dbQueries.getUserdiffCandidate(candidate.candidate_pair_id);
    const userdiffResponse1 = await dbQueries.getUserdiffResponseWithBody(userdiffCandidate.response_1_id);
    const userdiffRequest1 = userdiffResponse1? await dbQueries.getUserdiffRequest(userdiffResponse1.request_id): null;
    const userdiffResponse2 = await dbQueries.getUserdiffResponseWithBody(userdiffCandidate.response_2_id);
    const userdiffRequest2 = userdiffResponse2? await dbQueries.getUserdiffRequest(userdiffResponse2.request_id): null;


    let objs = [];

    if (refRequest) {
        const resp = await dbQueries.getSwapResponseWithBody(refRequest.request_id)
        objs.push({
            tag: 'ref',
            request: refRequest,
            response: resp,
            requestHeaders: await dbQueries.getSwapRequestHeaders(refRequest.request_id),
            responseHeaders: await dbQueries.getSwapResponseHeaders(resp.response_id),
        });
    }

    if (swapRequest && swapRequest) {
        const resp = await dbQueries.getSwapResponseWithBody(swapRequest.request_id)
        objs.push({
            tag: 'swap',
            request: swapRequest,
            response: resp,
            requestHeaders: await dbQueries.getSwapRequestHeaders(swapRequest.request_id),
            responseHeaders: await dbQueries.getSwapResponseHeaders(resp.response_id),
        });
    }

    if (userdiffRequest1 && userdiffResponse1) {
        objs.push({
            tag: 'userdiff1',
            request: userdiffRequest1,
            response: userdiffResponse1,
            requestHeaders: await dbQueries.getUserdiffRequestHeaders(userdiffResponse1.request_id),
            responseHeaders: await dbQueries.getUserdiffResponseHeaders(userdiffResponse1.response_id),
        });
    }

    if (userdiffRequest2 && userdiffResponse2) {
        objs.push({
            tag: 'userdiff2',
            request: userdiffRequest2,
            response: userdiffResponse2,
            requestHeaders: await dbQueries.getUserdiffRequestHeaders(userdiffResponse2.request_id),
            responseHeaders: await dbQueries.getUserdiffResponseHeaders(userdiffResponse2.response_id),
        });
    }

    return (
        <div>
            <a href={`/tasks/${params.taskId}/candidates`} className="btn mb-2"> &larr; Back to candidates</a>
            <h1> Candidate {params.candidateId} </h1>
            <h2> Candidate Details </h2>
            <table className="w-fit my-4 border-collapse">
                <tbody>
                    <tr>
                        <td className="px-2 border-2">ID</td>
                        <td className="px-2 border-2">{candidate.id}</td>
                    </tr>
                    <tr>
                        <td className="px-2 border-2">Userdiff Candidate Pair ID</td>
                        <td className="px-2 border-2">{candidate.candidate_pair_id}</td>
                    </tr>
                    <tr>
                        <td className="px-2 border-2">Request Template</td>
                        <td className="px-2 border-2"><JSONViewer data={candidate.swap_request_representation} /></td>
                    </tr>
                    <tr>
                        <td className="px-2 border-2">Interest Variables</td>
                        <td className="px-2 border-2"><JSONViewer data={candidate.interest_variables} /></td>
                    </tr>
                </tbody>
            </table>

            {/* {objs.filter((obj: any) => ['swap', 'userdiff1', 'userdiff2'].includes(obj.tag)).length === 3?(
                <CandidateQues swapR={objs.find((obj: any) => obj.tag === 'swap')} userdiffR1={objs.find((obj: any) => obj.tag === 'userdiff1')} userdiffR2={objs.find((obj: any) => obj.tag === 'userdiff2')} />
            ):( false )} */}

            <SideBySideViewer
                candidate={candidate}
                task={candidate.task}
                objs={objs}
                initialVisiblePanes={{
                    'ref': true,
                    'swap': true,
                    'userdiff1': true,
                    'userdiff2': false
                }}
            />
        </div>
    )

}