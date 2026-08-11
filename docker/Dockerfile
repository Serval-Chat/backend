# syntax=docker/dockerfile:1
# Node 22+ required: firebase-admin@14 and undici@8 refuse to install on 20.

FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS builder

WORKDIR /app

# node:22 bundles npm 10, which cannot resolve this npm 12 lockfile.
RUN npm i -g npm@12

COPY package.json package-lock.json ./

# Explicit --include=optional: npm sometimes skips sharp's nested libvips
# package, which fails at runtime rather than at install.
RUN npm ci --include=optional

RUN node -e "require('sharp'); require('bcrypt'); console.log('native modules OK')"

COPY tsconfig.json esbuild.config.js ./
COPY src/ src/

RUN npm run build
RUN npm prune --omit=dev


FROM node:22-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32

WORKDIR /app

# Keep in sync with .env and the nginx.prod.conf.template upstream.
ENV CHAT_PORT=8000
ENV NODE_ENV=production

COPY --from=builder /app/node_modules/ node_modules/
COPY --from=builder /app/dist/ dist/

COPY templates/ templates/
COPY static/ static/

# Read at runtime by getVersion().
COPY package.json ./

# public/ must exist or env.ts throws "Public folder not found" at startup.
RUN addgroup -S app && adduser -S app -G app \
    && mkdir -p logs uploads public \
    && chown -R app:app /app
USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider "http://127.0.0.1:${CHAT_PORT}/api/v1/system/info" || exit 1

CMD ["node", "dist/main.js"]
