FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci

FROM deps AS web-build
COPY web web
RUN npm run build -w web

FROM deps AS runtime
ENV NODE_ENV=production
COPY server server
COPY --from=web-build /app/web/dist server/public
WORKDIR /app/server
EXPOSE 3000
CMD ["npx", "tsx", "src/index.ts"]
