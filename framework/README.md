## Prerequisites

1. NodeJS
2. typescript `npm install -g typescript` and ts-node `npm install -g ts-node`
3. docker
4. [AccountFramework](./AccountFramework/README.md)

## Setup

1. Make sure the Account Framework is up and running
2. On the Account Framework, create two accounts on each website you wish to visit in the experiment. 
2. Create the Improper Auth docker containers using `docker compose up --build -d`
2. Expose the VNC port `55903` and connect to it from a VNC Client

## Manual user diff experiment

### 1. Setting up the auto worker

This step is to be done only once per experiment session by the experiment admin.

You can either join an existing experiment database by running `bash experiment-list.sh` or start a new experiment session with `bash experiment.sh` in the "auto" VNC Client.

This will create an experiment database, start the ZMQ listener to fetch websites from the Account Framework to process, and run the preanalysis worker. 

### 2. Starting the manual experiment session

This step is to be done by the experiment participants on their "manual" containers.
Run `bash experiment-list.sh` in the "manual" VNC Client to join the existing experiment session.

This command will also create a `manual-work.sh` file.

To start interacting with websites, run `bash manual-work.sh` in the VNC Client. This will open two browser windows, one for each account. The browser that opens on top is referred to as the `Leader` and the one that opens in the background is referred to as the `Follower`.

Performing interactions on the `Leader` browser will be mirrored on the `Follower` browser. The reverse is not true. As you interact, the framework will store all requests from both sessions along with the interaction  events. 

You also will have a CLI interface in the same terminal you run the command. This interface will allow you to perform the following actions:

- Restart the experiment for the current website
- Stop the experiment for the current website

After completing all tasks available, the CLI interface will close. 

To stop the experiment, and prevent the Improper Auth from fetching more websites, run `bash experiment.sh stop`.

## Developer Notes
### Updating the `playwright` submodule

If you update the `playwright` submodule, you need to run the following command to update the submodule on github:

1. First, push your changes from within the `playwright` directory.
2. Then run the following command from the root project directory:
```bash
git submodule update --remote --merge
```
