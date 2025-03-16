import { Pool } from "pg";
import dotenv from "dotenv";
import { gunzipSync } from "zlib";

dotenv.config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT || "55434"),
});

const unzipBody = (body: Uint8Array): string => {
    const buffer = Buffer.from(body);
    const unzippedBuffer = gunzipSync(buffer);
    return unzippedBuffer.toString("utf-8");
};

export const dbQueries = {
    getTasks: () => pool.query(`
    SELECT swap_tasks.id, subject_id, subjects.start_url, session_information, swap_tasks.visitation_end FROM swap_tasks
    join subjects on swap_tasks.subject_id = subjects.id  
    join sessions on swap_tasks.session_id = sessions.id  
    where result_name='scs'
    and swap_tasks.id in (select max(id) from swap_tasks where result_name='scs' and note not like '%dispos%' group by subject_id)
    order by swap_tasks.id
    `).then((res) => res.rows),

    getTask: (taskId: string) => pool.query(`
    SELECT swap_tasks.id, subject_id, subjects.start_url, session_information, swap_tasks.visitation_end FROM swap_tasks
    join subjects on swap_tasks.subject_id = subjects.id
    join sessions on swap_tasks.session_id = sessions.id
    where swap_tasks.id = $1
    `, [taskId]).then((res) => res.rows[0]),

    getCandidateCounts: () => pool.query(`
    SELECT task_id, count(1) FROM swap_candidate_pairs
    where state='finished'
    group by task_id
    `).then((res) => res.rows),

    getCandidates: (taskId: string) => pool.query(`
    SELECT id, candidate_pair_id, swap_request_representation, interest_variables FROM swap_candidate_pairs 
    WHERE task_id = $1 and state='finished'
    `, [taskId]).then((res) => res.rows),

    getCandidate: (candidateId: string) => pool.query(`
    SELECT id, candidate_pair_id, swap_request_representation, interest_variables FROM swap_candidate_pairs 
    WHERE id = $1
    `, [candidateId]).then((res) => res.rows[0]),

    getSwapRequest: (candidateId: string) => pool.query(`
    SELECT * FROM swap_request
    WHERE candidate_id = $1
    ORDER BY created_at DESC
    `, [candidateId]).then((res) => res.rows),

    getSwapRequestHeaders: (requestId: string) => pool.query(`
    SELECT * FROM swap_request_headers
    WHERE request_id = $1
    `, [requestId]).then((res) => res.rows),

    getSwapResponseWithBody: (requestId: string) => pool.query(`
    SELECT swap_response.response_id, status_code, status_line, body, swap_response.hash FROM swap_response
    JOIN swap_resp_body ON swap_response.hash = swap_resp_body.hash
    WHERE swap_response.request_id = $1
    `, [requestId]).then((res) => res.rows[0]).then((row) => {
        row.body = unzipBody(row.body);
        return row;
    }
    ),
    getSwapResponseHeaders: (responseId: string) => pool.query(`
    SELECT name, value FROM swap_response_headers
    WHERE response_id = $1
    `, [responseId]).then((res) => res.rows),

    getUserdiffCandidate: (candidateId: string) => pool.query(`
        SELECT id, response_1_id, response_2_id FROM analysis_candidate_pairs
        WHERE id = $1
    `, [candidateId]).then((res) => res.rows[0]),

    getUserdiffResponseWithBody: (responseId: string) => pool.query(`
    SELECT userdiff_response.response_id, request_id, status_code, status_line, body, userdiff_response.hash FROM userdiff_response
    LEFT JOIN userdiff_body ON userdiff_response.hash = userdiff_body.hash
    WHERE userdiff_response.response_id = $1
    `, [responseId]).then((res) => res.rows[0]).then((row) => {

        
        if (! row || !row.body) {
            return row;
        }

        row.body = unzipBody(row.body);
        return row;
    }
    ),

    getUserdiffResponseHeaders: (responseId: string) => pool.query(`
    SELECT name, value FROM userdiff_response_headers
    WHERE response_id = $1
    `, [responseId]).then((res) => res.rows),

    getUserdiffRequest: (requestId: string) => pool.query(`
    SELECT userdiff_request.request_id, params, method, url, body FROM userdiff_request
    WHERE userdiff_request.request_id = $1
    `, [requestId]).then((res) => res.rows[0]),

    getUserdiffRequestHeaders: (requestId: string) => pool.query(`
    SELECT name, value FROM userdiff_request_headers
    WHERE request_id = $1
    `, [requestId]).then((res) => res.rows),

    getSwapRequestStatusCodes: (taskId: string) => pool.query(`
    SELECT candidate_id, tag, swap_response.status_code FROM swap_response
    JOIN swap_request ON swap_response.request_id = swap_request.request_id
    JOIN swap_candidate_pairs ON swap_request.candidate_id = swap_candidate_pairs.id
    WHERE task_id = $1
    `, [taskId]).then((res) => res.rows),

    getStatusCodeCounts: (taskId?: string) => pool.query(`
    SELECT status_code, count(1) FROM swap_response
    JOIN swap_request ON swap_response.request_id = swap_request.request_id
    JOIN swap_candidate_pairs ON swap_request.candidate_id = swap_candidate_pairs.id
    ${taskId ? 'WHERE task_id = $1' : ''}
    group by status_code
    order by count desc
    `, taskId ? [taskId] : []).then((res) => res.rows),

}

export default {
    pool,
    dbQueries
}