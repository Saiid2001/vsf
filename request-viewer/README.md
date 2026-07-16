# Request Viewer

A local Next.js web app for reviewing the swap candidates produced by [VSF](../README.md). After a mirroring + swap run, the viewer connects to the crawler Postgres database and lets you page through candidate request/response pairs, compare the original and swapped responses side by side, and mark candidates as interesting or benign.

The full analyst workflow — including how the viewer fits into a VSF experiment — is documented in [`../docs/ANALYSIS.md`](../docs/ANALYSIS.md).

## Prerequisites

- Node.js 20+ and npm (matches the version pinned in the framework Dockerfile).
- A running VSF crawler Postgres DB (see [`../framework/README.md`](../framework/README.md)). The DB is exposed on `127.0.0.1:55434` by the default `docker-compose.yml`.

## Setup

1. Create `request-viewer/.env` with your DB coordinates:

   ```bash
   DB_HOST=127.0.0.1
   DB_PORT=55434
   DB_USER=postgres
   DB_PASSWORD="<contents of framework/crawler/secrets/db_password.txt>"
   DB_NAME="userdiff_manual___YYYY_MM_DD_HH_MM_SS"
   ```

2. Install dependencies and start the dev server:

   ```bash
   cd request-viewer
   npm install
   npm run dev
   ```

3. Open <http://localhost:3000>.

## Structure

- `app/` — Next.js App Router pages and API routes.
- `db.ts` — Postgres connection pool and query helpers.
- `tailwind.config.ts`, `postcss.config.mjs` — styling.

## Notes

- The viewer is read-mostly against the crawler DB; it also writes analyst labels back to the same DB. Do not point it at a production database.
- No authentication is built in — run it on localhost only.
