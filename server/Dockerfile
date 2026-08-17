# ── Build stage ─────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Runtime stage ───────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache aws-cli
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
# Drizzle migrations run from source (tsx), not the compiled dist — keep
# the schema/migration folder and tsx available at runtime.
COPY --from=build /app/src/database ./src/database
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
# Backup scripts (backup.sh, prune-b2.ts) run via sh and npx tsx at runtime
COPY scripts ./scripts
RUN npm install tsx --no-save
RUN mkdir -p uploads
EXPOSE 4000
CMD ["node", "dist/main.js"]
