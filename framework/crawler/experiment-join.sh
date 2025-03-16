CWD=$(pwd)
DB_NAME=$2
TIMESTAMP=$1

POSTGRES_DB=$DB_NAME
STDOUT_LOG_PATH=/crawler-data/crawl_$TIMESTAMP/log      # Path for normal log output
STDERR_LOG_PATH=/crawler-data/crawl_$TIMESTAMP/err      # Path for error log output
DATA_PATH=/crawler-data/crawl_$TIMESTAMP/data           # Path for crawl artifacts

POSTGRES_PASSWORD=$(cat $POSTGRES_PASSWORD_FILE | tr -d '\n')
# Create new database for the experiment
PGPASSWORD=$POSTGRES_PASSWORD psql -h $POSTGRES_HOST -U $POSTGRES_USER -c "CREATE DATABASE $POSTGRES_DB;";
export POSTGRES_DB=$POSTGRES_DB;

# Create a source file for the environment variables
# empty it first
mkdir -p /crawler-data/secrets
echo "" > /crawler-data/secrets/current_experiment.sh
echo "export POSTGRES_DB=\"$POSTGRES_DB\"" >> /crawler-data/secrets/current_experiment.sh
echo "export POSTGRES_PASSWORD=\"$POSTGRES_PASSWORD\"" >> /crawler-data/secrets/current_experiment.sh
echo "export STDOUT_LOG_PATH=\"$STDOUT_LOG_PATH\"" >> /crawler-data/secrets/current_experiment.sh
echo "export STDERR_LOG_PATH=\"$STDERR_LOG_PATH\"" >> /crawler-data/secrets/current_experiment.sh
echo "export DATA_PATH=\"$DATA_PATH\"" >> /crawler-data/secrets/current_experiment.sh
echo "export POSTGRES_HOST=\"$POSTGRES_HOST\"" >> /crawler-data/secrets/current_experiment.sh
echo "export POSTGRES_USER=\"$POSTGRES_USER\"" >> /crawler-data/secrets/current_experiment.sh
echo "export TIMESTAMP=\"$TIMESTAMP\"" >> /crawler-data/secrets/current_experiment.sh
echo "export EXPERIMENT=\"$EXPERIMENT\"" >> /crawler-data/secrets/current_experiment.sh

# clear .env
echo "" > .env;

# Make postgres database name/password available for crawler
echo "POSTGRES_DB=\"$POSTGRES_DB\"" >> .env;
echo "POSTGRES_PASSWORD=\"$POSTGRES_PASSWORD\"" >> .env;

# Make $DISPLAY variable available to crawler
echo "DISPLAY=:99" >> .env;

# Prepare database and check disk folders
./src/setup/prepare.sh $CWD $STDOUT_LOG_PATH $STDERR_LOG_PATH $DATA_PATH --module $EXPERIMENT

# To start the crawlers using a sample csv file, run. CSV format should be: rank,domain
# [!IMPORTANT] If using this method, make sure to disable starti ng the ZMQ listener by setting ZMQ_ENABLE to false
# ./setup/prepare.sh $CWD $STDOUT_LOG_PATH $STDERR_LOG_PATH $DATA_PATH --module $EXPERIMENT --fill --csv [path-to-your-csv]

# Check if should skip stop between preparing of db and crawler start
# if [ "$1" != "-y" ]; then
#     read -p "[experiment] Do you want to start the crawl? (yY/nN) " yn

#     case $yn in 
#     y|Y ) echo "[experiment] Beginning startup of crawlers";;
#     n|N ) exit 1;;
#     * ) exit 1;;
#     esac
# fi

CRAWLER_START=1     # Id of first crawler to start
CRAWLER_COUNT=$N_WORKERS    # Number of seperate crawlers to start (max. cap on crawler id, incremented during start)
POLLING_INTERVAL=30  # Interval crawlers look into database for new tasks in seconds

if [[ "$EXPERIMENT" == "userdiff_manual" ]]; then 
    
    if [[ "$WORKER_TYPE" == "auto" ]]; then
        # start the analysis worker
        echo "[experiment] Starting the analysis worker"
        python3 /analysis/run_auto.py --datapath $DATA_PATH --logpath $STDOUT_LOG_PATH --dbname $POSTGRES_DB --dbuser $POSTGRES_USER --dbpwd $POSTGRES_PASSWORD --dbhost $POSTGRES_HOST >> $STDOUT_LOG_PATH/analysis-worker.log 2>> $STDERR_LOG_PATH/analysis-worker.log &
    else
        touch /crawler/manual-work.sh

        COMMAND="npx crawler --headfull --module $EXPERIMENT --polling $POLLING_INTERVAL --datapath $DATA_PATH --forever --chromium -- \"manual-work \${@}\""
        echo "#!/bin/bash" > /crawler/manual-work.sh
        echo "echo \"[experiment] Starting the manual worker\"" >> /crawler/manual-work.sh
        echo "$COMMAND" >> /crawler/manual-work.sh
        chmod +x /crawler/manual-work.sh
    fi

else if [[ "$EXPERIMENT" == "swap" ]]; then 
    if [[ "$WORKER_TYPE" == "auto" ]]; then
        # npx crawler --headfull --module $EXPERIMENT --polling $POLLING_INTERVAL --datapath $DATA_PATH --forever --chromium -- $CRAWLER_START $CRAWLER_COUNT
        echo "[experiment] Starting the swap worker"
        ./src/setup/spawn.sh $CWD $STDOUT_LOG_PATH $STDERR_LOG_PATH $CRAWLER_START $CRAWLER_COUNT --module $EXPERIMENT --headfull --polling $POLLING_INTERVAL --datapath $DATA_PATH --forever  --chromium
    else
        echo "UNIMPLEMENTED WORKER TYPE FOR EXPERIMENT $EXPERIMENT"
    fi
    else
        echo "UNIMPLEMENTED WORKER TYPE FOR EXPERIMENT $EXPERIMENT"
    fi
fi

# # Start ZMQ session fetcher
if [[ "$WORKER_TYPE" == "auto" && "$ZMQ_ENABLE" == "true" ]]; then 
    ZMQ_FETCH_INTERVAL=30   # Interval which is waited between calls to ZMQ server for new session in seconds
    
    echo "[experiment] Starting zmq listener for session fetching."
        node --max-old-space-size=16384 $CWD/dist/utils/zmq/zmq-listener.js --crawlers $CRAWLER_COUNT --fetchinterval $ZMQ_FETCH_INTERVAL 2>> $STDERR_LOG_PATH/zmq-listener.log >> $STDOUT_LOG_PATH/zmq-listener.log &
fi

echo "[experiment] Started the experiment"
