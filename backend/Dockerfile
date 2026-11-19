# Stage 1: Build
# node:26-alpine: Node 26 "Lithium" is the Active LTS release since 2026-10-28 (https://github.com/nodejs/Release,
# schedule.json; https://nodejs.org/en/about/previous-releases), and Alpine keeps the image small.
FROM node:26-alpine AS builder

WORKDIR /app

COPY package*.json tsconfig.json ./
RUN npm ci

COPY src ./src
RUN npm run build

# Stage 2: Runtime
FROM node:26-alpine AS runtime

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Run as non-root user (node user is built into official node images)
USER node

# F-17: marks this image as a deployment; the app refuses to boot unless NODE_ENV=production.
ENV FILLSCORE_DEPLOY=1

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]
