FROM node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS build
WORKDIR /app
RUN npm install -g pnpm@11.21.0 --ignore-scripts
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=tuominwang-pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile --fetch-timeout=600000 --network-concurrency=4
COPY tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY licenses ./licenses
COPY tests ./tests
ARG WEB_BASE_PATH=/
RUN --mount=type=cache,id=tuominwang-pnpm,target=/root/.local/share/pnpm/store VITE_BASE_PATH="$WEB_BASE_PATH" pnpm build && CI=true pnpm install --prod --offline --frozen-lockfile

FROM node:24-bookworm-slim@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6 AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4318 DATA_DIR=/data OCR_MODEL_DIR=/models/ocr NER_MODEL_DIR=/models/ner VISUAL_MODEL_DIR=/models/visual ORT_DISABLE_TELEMETRY=1
COPY --from=build --chown=node:node /app/package.json /app/pnpm-lock.yaml ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api ./apps/api
COPY --from=build --chown=node:node /app/apps/worker ./apps/worker
COPY --from=build --chown=node:node /app/packages ./packages
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/licenses ./licenses
COPY --from=build --chown=node:node /app/tests ./tests
RUN mkdir /data && chown node:node /data
USER node
CMD ["node", "scripts/check-runtime.ts", "api"]

FROM nginx:1.28-alpine@sha256:a8b39bd9cf0f83869a2162827a0caf6137ddf759d50a171451b335cecc87d236 AS web
ARG WEB_NGINX_CONFIG=deploy/nginx.conf
COPY ${WEB_NGINX_CONFIG} /etc/nginx/nginx.conf
COPY --from=build /app/dist/web /usr/share/nginx/html
USER nginx
ENTRYPOINT ["nginx", "-g", "daemon off;"]
