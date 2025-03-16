import pool from "../../../db";

export async function GET(req: Request) {

    try {
        const result = await pool.query("SELECT * FROM swap_tasks");
        return new Response(JSON.stringify(result.rows), {
            status: 200,
            headers: { "content-type": "application/json" },
        });

    } catch (error: any) {
        console.log("Error fetching tasks", error);
        return new Response("Internal server error", {
            status
                : 500
        });
    }
}