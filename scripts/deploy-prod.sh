#!/bin/bash
set -ex

docker build --build-arg APP_BASE=/chat -f Dockerfile . -t 220748827472.dkr.ecr.us-east-2.amazonaws.com/lanzatech/chat-ui:latest-prod
docker push 220748827472.dkr.ecr.us-east-2.amazonaws.com/lanzatech/chat-ui:latest-prod
aws --profile ResearchProducts ecs update-service --cluster LanzaChat-prod --service LanzaChatService-prod --force-new-deployment --no-paginate
