# syntax=docker/dockerfile:1
# Single image: the NestJS API under /api plus the web build on every other
# path (API_PREFIX + WEB_DIST_DIR). Build: ./scripts/docker-build.sh

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-bookworm-slim AS base
ARG PNPM_VERSION=12.9.1
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install -g pnpm@${PNPM_VERSION}
WORKDIR /app

# Only the manifests, so the dependency layers survive source changes
FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

FROM manifests AS deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM manifests AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter api

FROM deps AS build
COPY apps/api apps/api
COPY apps/web apps/web
WORKDIR /app/apps/api
# prisma generate doesn't connect; the config just needs a URL to parse
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build \
    pnpm prisma generate --config prisma7.config.ts \
 && pnpm build
WORKDIR /app/apps/web
# No VITE_API_URL: the web calls /api on its own origin
RUN pnpm build

FROM node:${NODE_VERSION}-bookworm-slim AS runtime
LABEL org.opencontainers.image.title="budget" \
      org.opencontainers.image.description="Budget: finanças pessoais e de grupos (API NestJS + web React)" \
      org.opencontainers.image.source="https://github.com/Zeegfreet/budget"
ENV NODE_ENV=production \
    PORT=3000 \
    API_PREFIX=api \
    WEB_DIST_DIR=/app/web
WORKDIR /app/apps/api
COPY --from=prod-deps --chown=node:node /app/node_modules /app/node_modules
COPY --from=prod-deps --chown=node:node /app/apps/api/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api/dist ./dist
COPY --chown=node:node apps/api/package.json apps/api/prisma7.config.ts ./
COPY --chown=node:node apps/api/prisma ./prisma
COPY --from=build --chown=node:node /app/apps/web/dist /app/web
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/budget-entrypoint
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/'+process.env.API_PREFIX).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["budget-entrypoint"]
CMD ["node", "dist/main.js"]
