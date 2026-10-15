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
COPY --from=build /app/packages ./packages
CMD ["node", "server/worker/dist/worker.js"]

FROM node:24.16.0-alpine AS web
ENV NODE_ENV=production
WORKDIR /app
COPY --from=web-build /app/.next/standalone ./
COPY --from=web-build /app/.next/static ./.next/static
COPY --from=web-build /app/public ./public
CMD ["node", "server.js"]
