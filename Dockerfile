FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci

FROM deps AS web-build
COPY web web
RUN npm run build -w web

FROM deps AS production-deps
RUN npm prune --omit=dev

FROM node:22-slim AS runtime
WORKDIR /app
COPY --from=production-deps /app/node_modules ./node_modules
COPY package.json ./
ENV NODE_ENV=production
COPY server server
COPY --from=web-build /app/web/dist server/public
WORKDIR /app/server
EXPOSE 3000
CMD ["../node_modules/.bin/tsx", "src/index.ts"]
