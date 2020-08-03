#!/bin/bash
# Travis CI Bash Script for Installing Nginx on Travis CI and Testing Configurations
# https://github.com/mitchellkrogza

set -x

sudo rm /etc/nginx/sites-available/default
sudo cp $TRAVIS_BUILD_DIR/server.conf /etc/nginx/sites-available/keyval-server.conf
sudo ln -s /etc/nginx/sites-available/keyval-server.conf /etc/nginx/sites-enabled/keyval-server.conf

sudo nginx -c /etc/nginx/nginx.conf
sudo service nginx reload
