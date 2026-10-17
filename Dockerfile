# Rostra - all-in-one Discord bot
FROM node:22-alpine

WORKDIR /app

# Fonts for @napi-rs/canvas text rendering (profile cards). Alpine ships no fonts
# by default, so canvas would draw blank text without these.
RUN apk add --no-cache fontconfig font-dejavu

# Install dependencies (tsx is a runtime dependency - the bot runs TypeScript directly)
RUN npm install --global corepack@0.35.0 && corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tooling/biome/package.json ./tooling/biome/package.json
COPY packages/config/package.json ./packages/config/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json
COPY packages/database/package.json ./packages/database/package.json
COPY packages/cache/package.json ./packages/cache/package.json
COPY packages/logger/package.json ./packages/logger/package.json
COPY packages/i18n/package.json ./packages/i18n/package.json
COPY packages/discord-ui/package.json ./packages/discord-ui/package.json
COPY packages/testing/package.json ./packages/testing/package.json
RUN pnpm install --frozen-lockfile

# Generate offline without loading deployment credentials. Migrations still use
# prisma.config.ts and the runtime DATABASE_URL.
COPY packages/database/prisma ./packages/database/prisma
COPY prisma.config.ts ./
COPY tooling/prisma-generate.config.ts ./tooling/prisma-generate.config.ts
RUN pnpm prisma:generate

# App source
COPY . .

# Startup script: run migrations, then start. Makes `docker compose up` turnkey.
RUN chmod +x docker-entrypoint.sh

ENV NODE_ENV=production

# Health endpoint port
EXPOSE 3000

# Apply migrations, then the manager process spawns shards.
ENTRYPOINT ["./docker-entrypoint.sh"]
