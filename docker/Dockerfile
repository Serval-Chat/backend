FROM node:20-alpine@sha256:f598378b5240225e6beab68fa9f356db1fb8efe55173e6d4d8153113bb8f333c AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++ vips-dev
RUN npm install -g node-gyp
ENV PYTHON=/usr/bin/python3
ENV npm_config_build_from_source=true

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json esbuild.config.js ./
COPY src/ src/

RUN npm run build
RUN npm prune --production

FROM node:20-alpine@sha256:f598378b5240225e6beab68fa9f356db1fb8efe55173e6d4d8153113bb8f333c

WORKDIR /app

RUN apk add --no-cache vips

COPY --from=builder /app/node_modules/ node_modules/

COPY --from=builder /app/dist/ dist/

COPY templates/ templates/
COPY static/ static/

RUN addgroup -S app && adduser -S app -G app \
    && mkdir -p logs uploads public \
    && chown -R app:app /app
USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/v1/system/info || exit 1

CMD ["node", "dist/main.js"]
