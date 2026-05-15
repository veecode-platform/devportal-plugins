#!/bin/bash

# get the current release version from backend package.json
#export VERSION=$(cat ../plugins/github-workflow-backend/package.json | grep version | cut -d '"' -f 4)
#echo "Using version $VERSION"

#export BACKEND_INTEGRITY=$(npm view @veecode-platform/backstage-plugin-github-workflows-backend-dynamic@${VERSION} dist.integrity)
#echo "Backend integrity: $BACKEND_INTEGRITY"

#export FRONTEND_INTEGRITY=$(npm view @veecode-platform/backstage-plugin-github-workflows-dynamic@${VERSION} dist.integrity)
#echo "Frontend integrity: $FRONTEND_INTEGRITY"

#envsubst < dynamic-plugins.yaml > ./dynamic-plugins.local.yaml

echo "Starting docker-compose mounting the dist-dynamic folders from plugins"
echo "Don't forget to build the dynamic plugins first"

docker-compose up
