FROM node:22-slim AS deps
WORKDIR /app

COPY package*.json ./
RUN npm ci

FROM node:22-slim AS build
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build && npm prune --omit=dev

FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/openapi ./openapi

EXPOSE 3002

CMD ["node", "dist/server.js"]
