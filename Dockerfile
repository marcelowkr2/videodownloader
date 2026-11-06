FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
RUN apk add --no-cache ffmpeg ca-certificates curl \
 && curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_musllinux -o /usr/local/bin/yt-dlp \
 && chmod +x /usr/local/bin/yt-dlp \
 && apk del curl
WORKDIR /app
ENV NODE_ENV=production PORT=3000 STATIC_DIR=/app/dist
COPY --from=build /app/dist ./dist
COPY --from=build /app/server-dist ./server-dist
USER node
EXPOSE 3000
CMD ["node", "server-dist/index.js"]
