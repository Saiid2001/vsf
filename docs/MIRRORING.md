# Mirroring Experiment Instructions

In this documents, we provide the necessary instructions to perform the manual visitation experiments to mirror browser sessions across pairs of users.

## Containers Structure

In this framework, we can find three types of docker containers (or workers):

- **Userdiff Auto**: This container is responsible for 
    1. fetching available tasks from the Account Framework (by finding available session pairs) and populating these tasks in the database.
    2. running automated workers for the filtering and analysis of task request pairs.

    Apart from setting this container up, you will not need to interact with it directly.
- **Userdiff Manual**: You will connect to this container (through VNC) to perform the manual visitation tasks and browse the websites for the available tasks. You can copy and paste the container configuration in the expeiment [docker compose file](../framework/docker-compose.yml) to instantiate multiple manual containers for multiple users.
- **Swap Auto**: this container is responsible for running automated crawlers to perform the automated swapping experiments. You will not need to interact with this container directly.

## Experiment Setup

Before starting visitations, we need to set up the experiment environment on the associated docker containers.

### Starting a new expriment

To initiate a new experiment to set up the database and the appropriate configuration, log in to the `improper-auth-crawler-userdiff_auto` container using your VNC application (on port 55903) or docker SSH directly to it. Then, run the following command:

```bash
bash experiment.sh
```

This script will create a new experiment database and join the container session into it. You will find printed on your console the expeirment ID of the form `userdiff_manual___YYYY_MM_DD_HH_MM_SS`. 
Keep this ID in mind for later experiment sessions if you restart the docker containers.

### Joining an existing experiment

If you want to join an existing experiment, you can do so by running the following command:

```bash
bash experiment-list.sh
```

You will see a list of all experiment databases already created in the system. Choose the experiment ID you want to join by using the UP and DOWN arrow keys and pressing ENTER. The system will then join the container session into the selected experiment.

### Stopping an experiment session

If you want to stop the experiment, to close all corresponding worker processes and background tasks, you can do so by running the following command:

```bash
bash experiment-stop.sh
```

## Manual Website Visitation

After setting up the experiment on the auto docker container, we need to connect the manual docker container and swap container to the experiment database using the same procedure as above (`bash experiment-list.sh`).

### Starting a new manual visitation session

There are two ways you can start a new manual visitation session:
1. **Visitation with Live Swapping:** In this mode, while you visit the webpage, the automated workers will filter and prepare swapping candidates on the fly and the swapping worker will send the swapped requests from the worker networking interface directly. 
This mode is best for guaranteeing the freshness of the non-swapped parameters like session cookies and CSRF tokens. 
However, it might interfer with your ongoing visitation session if the swapped requests succeed and alter your user state.
Also, this mode only allows for automated swap candidates not manually curated ones.
Start this mode with the following command:
    ```
    bash manual-work.sh --live
    ```

2. **Visitation with Delayed Swapping:**
In this mode, you will visit the webpage and the automated workers will filter and prepare swapping candidates in the background but will not send the swapped requests.
Swapping candidates will be available for review later on through a [dedicated process](./MIRRORING.md#manual-swapping-candidates-review).
This mode is best for ensuring that the swapping candidates are not interfering with your ongoing visitation session and for manually curating the swapping candidates.
However, this mode might result in stale swapping candidates if the automated swapping workers are not able to replace parameters like session cookies and CSRF tokens with fresh values.
Start this mode with the following command:
    ```
    bash manual-work.sh
    ```
