#!/bin/bash
CWD=$(pwd)
TIMESTAMP=$(date '+%Y_%m_%d_%H_%M_%S')

bash experiment-stop.sh
bash experiment-join.sh $TIMESTAMP userdiff_manual___$TIMESTAMP