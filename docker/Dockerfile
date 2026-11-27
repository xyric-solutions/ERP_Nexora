ARG NEXORA_RUNTIME=web

FROM node:24.16.0-alpine AS build
WORKDIR /app
COPY . .
RUN npm ci
RUN npx tsc -b --clean && npm run typecheck

FROM build AS production-dependencies
RUN npm prune --omit=dev

FROM build AS web-build
ARG APP_URL
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
ARG NEXORA_API_PROXY_ORIGIN
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
RUN npm run build:web

FROM node:24.16.0-alpine AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-dependencies /app/package.json /app/package-lock.json ./
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/server/api/dist ./server/api/dist
COPY --from=build /app/packages ./packages
CMD ["node", "server/api/dist/server.js"]

FROM node:24.16.0-alpine AS worker
ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-dependencies /app/package.json /app/package-lock.json ./
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/server/worker/dist ./server/worker/dist
# The worker imports @nexora/api/finance-posting; node_modules/@nexora/api is a
# workspace link to server/api, so its manifest and build output must be present.
COPY --from=build /app/server/api/package.json ./server/api/package.json
COPY --from=build /app/server/api/dist ./server/api/dist
COPY --from=build /app/packages ./packages
CMD ["node", "server/worker/dist/worker.js"]

FROM node:24.16.0-alpine AS web
ENV NODE_ENV=production
WORKDIR /app
COPY --from=web-build /app/.next/standalone ./
COPY --from=web-build /app/.next/static ./.next/static
COPY --from=web-build /app/public ./public
CMD ["node", "server.js"]

FROM postgres:18.7-alpine AS postgres
COPY --chmod=0555 docker/postgres/001-provision-roles.sh /docker-entrypoint-initdb.d/

FROM ${NEXORA_RUNTIME} AS deploy
