## Swap Request Viewer

We provide a web viewer for the results of the swapping tasks. To open the viewer:

1. Set the database ID you use in the mirroring experiment inside `request-viewer/.env` file. The file should look like this:
    ```bash
    DB_HOST=127.0.0.1
    DB_PORT=55434
    DB_USER=postgres
    DB_PASSWORD="<database password from framework/crawler/secrets/db_password.txt>"
    DB_NAME="userdiff_manual___YYYY_MM_DD_HH_MM_SS"
    ```


2. run the following commands:
    ```
    bash
    cd request-viewer
    npm run dev
    ```

The viewer will be available at `http://localhost:3000`. You can use the viewer to inspect the swapped requests and responses and compare them with the original requests and responses.