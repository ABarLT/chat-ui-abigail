#!/bin/bash
set -ex

docker build --build-arg APP_BASE=/chat-uat -f Dockerfile . -t 220748827472.dkr.ecr.us-east-2.amazonaws.com/lanzatech/chat-ui:latest-uat
docker push 220748827472.dkr.ecr.us-east-2.amazonaws.com/lanzatech/chat-ui:latest-uat
sleep 2
aws --profile ResearchProducts ecs update-service --cluster LanzaChat-uat --service LanzaChatService-uat --force-new-deployment --no-paginate
