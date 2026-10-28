FROM node:24-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts && npm rebuild esbuild
COPY . .
RUN npm run build:server

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080 DB_PATH=/data/ledger.sqlite AUTH_PATH=/data/magnific-auth.json STATIC_DIR=/app/public
COPY --from=build /src/dist-server/server.mjs ./server.mjs
COPY --from=build /src/dist-server/public ./public
VOLUME /data
EXPOSE 8080
USER node
CMD ["node","server.mjs"]
