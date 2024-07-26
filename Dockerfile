# syntax=docker/dockerfile:1
# read the doc: https://huggingface.co/docs/hub/spaces-sdks-docker
# you will also find guides on how best to write your Dockerfile
ARG INCLUDE_DB=false

# stage that install the dependencies
FROM node:20 AS builder-production

WORKDIR /app

COPY --link --chown=1000 package-lock.json package.json ./
RUN --mount=type=cache,target=/app/.npm \
        npm set cache /app/.npm && \
        npm ci --omit=dev

FROM builder-production AS builder

ARG APP_BASE=
ARG PUBLIC_APP_COLOR=blue
ENV BODY_SIZE_LIMIT=15728640

RUN --mount=type=cache,target=/app/.npm \
        npm set cache /app/.npm && \
        npm ci

COPY --link --chown=1000 . .

RUN npm run build

# mongo image
FROM mongo:latest AS mongo

WORKDIR /app

RUN npm install -g pm2 dotenv-cli

# image to be used if INCLUDE_DB is true
FROM node:20-slim AS local_db_true

CMD dotenv -e .env -c -- pm2 start /app/build/index.js -i $CPU_CORES --no-daemon
