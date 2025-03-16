import pool from "../../../../db";

export async function GET(req: Request, { params }: { params: { taskId: string } }) {

    try {
        const result = await pool.query("SELECT * FROM swap_candidate_pairs WHERE task_id = $1", [params.taskId]);
        return new Response(JSON.stringify(result.rows), {
            status: 200,
            headers: { "content-type": "application/json" },
        });

    } catch (error: any) {
        console.log("Error fetching candidates", error);
        return new Response("Internal server error", {
            status
                : 500
        });
    }
}