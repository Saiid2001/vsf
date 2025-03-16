import ExpandableRowsGroup from "@/app/common/ExpandableRowsGroup";
import JSONViewer from "@/app/common/JSONViewer";
import { dbQueries } from "@/db";


function groupCandidatesByURLPathTemplate(candidates: any[]): Record<string, any[]> {
    return candidates.reduce((acc, candidate) => {
        const urlPathTemplate = candidate.swap_request_representation.template.url_path.template;
        if (!acc[urlPathTemplate]) {
            acc[urlPathTemplate] = [];
        }
        acc[urlPathTemplate].push(candidate);
        return acc;
    }, {} as Record<string, any[]>);
}

const methodColor: Record<string, string> = {
    GET: "green",
    POST: "blue",
    PUT: "blue",
    DELETE: "red",
    PATCH: "blue",
    HEAD: "gray",
    OPTIONS: "gray",
    TRACE: "gray",
}

const statusCodeColor: Record<number, string> = {
    404: "red",
    200: "green",
    403: "yellow",
    401: "yellow",
    500: "violet",
    502: "violet",
    503: "violet",
    504: "violet",
    0: "gray",
    301: "blue",
    302: "blue",
    303: "blue",
    307: "blue",
    308: "blue",
    400: "cyan",
    405: "cyan",
    406: "cyan",
    407: "cyan",
    408: "cyan",
    409: "cyan",
    410: "cyan",
    411: "cyan",
}


export default async function CandidateList({ params }: { params: { taskId: string } }) {

    const task = await dbQueries.getTask(params.taskId);
    const candidates = await dbQueries.getCandidates(params.taskId);
    const statusCodes = await dbQueries.getSwapRequestStatusCodes(params.taskId);

    const candidatesByURLPathTemplate = groupCandidatesByURLPathTemplate(candidates);

    const statusCodeCounts = await dbQueries.getStatusCodeCounts(params.taskId);

    return (
        <main>
            < a href="/" className="btn mb-2"> &larr; Back to tasks</a>
            <h1>Task {params.taskId} </h1>

            <h2>Task Details</h2>
            <table className="w-fit my-4 border-collapse">
                <tbody>
                    <tr>
                        <td className="px-2 border-2">Subject ID</td>
                        <td className="px-2 border-2">{task.subject_id}</td>

                    </tr>
                    <tr>
                        <td className="px-2 border-2">Subject Site</td>
                        <td className="px-2 border-2">{task.start_url}</td>
                    </tr>
                    <tr>
                        <td className="px-2 border-2">Account ID</td>
                        <td className="px-2 border-2">{task.session_information.account.id}</td>
                    </tr>
                    <tr>
                        <td className="px-2 border-2">Identity</td>
                        <td className="px-2 border-2">{task.session_information.account.credentials.identity.id} {task.session_information.account.credentials.identity.username}</td>
                    </tr>
                    <tr>
                        <td className="px-2 border-2">Visited On</td>
                        <td className="px-2 border-2">{task.visitation_end.toLocaleString('en-US')}</td>
                    </tr>
                </tbody>
            </table>

            <h2>Stats</h2>
            <table className="w-fit">
                <thead>
                    <tr>
                        <th className="px-2">Status Code</th>
                        <th className="px-2">Count</th>
                    </tr>
                </thead>
                <tbody>
                    {statusCodeCounts.map((row: any) => (
                        <tr key={row.status_code}>
                            <td className="px-2">{row.status_code}</td>
                            <td className="px-2">{row.count}</td>
                        </tr>
                    ))}
                </tbody>
            </table>


            <h2>Candidate List</h2>

            <table className="w-fit mt-8">
                <thead>
                    <tr>
                        <th className="px-2">ID</th>
                        <th className="px-2">Method</th>
                        <th className="px-2">URL Path Template</th>
                        <th className="px-2">Interest Variables</th>
                        <th className="px-2">Ref. Status Code</th>
                        <th className="px-2">Swap Status Code</th>
                        <th className="px-2">Actions</th>
                    </tr>
                </thead>

                <tbody>
                    {/* {candidates.map((candidate: any) => (
                        <tr key={candidate.id} className="border-b">
                            <td className="px-2 py-4 text-right">{candidate.id}</td>
                            <td className="px-2 py-4">{candidate.swap_request_representation.template.method}</td>
                            <td className="px-2 py-4">{candidate.swap_request_representation.template.url_path.template}</td>
                            <td className="px-2 py-4"><JSONViewer data={candidate.interest_variables} /></td>
                            <td className="px-2 py-4">{statusCodes.find(row => row.tag === 'ref' && row.candidate_id === candidate.id)?.status_code}</td>
                            <td className="px-2 py-4">{statusCodes.find(row => row.tag === 'swap' && row.candidate_id === candidate.id)?.status_code}</td>
                            <td className="px-2 py-4">
                                <a href={`/tasks/${params.taskId}/candidates/${candidate.id}`} className="btn">Details</a>
                            </td>
                        </tr>
                    ))} */}

                    {Object.entries(candidatesByURLPathTemplate).map(([urlPathTemplate, candidates]) => (

                        <ExpandableRowsGroup
                            summary={urlPathTemplate}
                            rows={
                                candidates.map((candidate: any) => (
                                    <tr key={candidate.id} className="border-b">
                                        <td className="px-2 py-4 text-right">{candidate.id}</td>
                                        <td className="px-2 py-4" style={{ color: methodColor[candidate.swap_request_representation.template.method] }}
                                        >{candidate.swap_request_representation.template.method}</td>
                                        <td className="px-2 py-4">{candidate.swap_request_representation.template.url_path.template}</td>
                                        <td className="px-2 py-4"><JSONViewer data={candidate.interest_variables} /></td>
                                        <td className="px-2 py-4" style={{ color: statusCodeColor[statusCodes.find(row => row.tag === 'ref' && row.candidate_id === candidate.id)?.status_code] }}>{statusCodes.find(row => row.tag === 'ref' && row.candidate_id === candidate.id)?.status_code}</td>
                                        <td className="px-2 py-4 font-bold text-xl" style={{ color: statusCodeColor[statusCodes.find(row => row.tag === 'swap' && row.candidate_id === candidate.id)?.status_code] }}>
                                            {statusCodes.find(row => row.tag === 'swap' && row.candidate_id === candidate.id)?.status_code}</td>
                                        <td className="px-2 py-4 font-bold text-xl">
                                            <a href={`/tasks/${params.taskId}/candidates/${candidate.id}`} className="btn">Details</a>
                                        </td>
                                    </tr>
                                ))
                            }
                        />
                    )).flat()}
                </tbody>
            </table>



        </main>
    );

}