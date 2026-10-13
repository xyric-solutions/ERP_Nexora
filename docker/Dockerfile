FROM node:24.16.0-alpine AS build
WORKDIR /app
COPY . .
RUN npm ci
RUN npx tsc -b --clean && npm run typecheck

FROM build AS production-dependencies
RUN npm prune --omit=dev

FROM build AS web-build
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
RUN npm run build --workspace @nexora/web

FROM node:24.16.0-alpine AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-dependencies /app/package.json /app/package-lock.json ./
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/packages ./packages
CMD ["node", "apps/api/dist/server.js"]

FROM node:24.16.0-alpine AS worker
ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-dependencies /app/package.json /app/package-lock.json ./
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/apps/worker/dist ./apps/worker/dist
COPY --from=build /app/packages ./packages
CMD ["node", "apps/worker/dist/worker.js"]

FROM node:24.16.0-alpine AS web
ENV NODE_ENV=production
WORKDIR /app
COPY --from=web-build /app/apps/web/.next/standalone ./
COPY --from=web-build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-build /app/apps/web/public ./apps/web/public
CMD ["node", "apps/web/server.js"]
