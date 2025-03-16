#!/bin/bash

export APP_USER=crawler

# Transfer ownsership of directory
chown -R $APP_USER:$APP_USER .

# Create home directory for unprivileged user
mkdir -p /home/$APP_USER
# Change ownership of home directory to unprivileged user
chown -R $APP_USER:$APP_USER /home/$APP_USER
# Set the home directory to this directory
export HOME=/home/crawler

# Run the rest as an unprivileged user
su -s /bin/bash -m crawler -c "./entrypoint-unprivileged.sh"
