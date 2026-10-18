FROM node:22-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache fontconfig font-dejavu \
	&& npm install --global corepack@0.35.0 \
	&& corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tooling/biome/package.json ./tooling/biome/package.json
COPY packages ./packages
COPY apps ./apps
COPY modules ./modules
COPY games ./games
COPY tooling ./tooling
COPY infra ./infra
COPY prisma.config.ts turbo.json tsconfig.json biome.json ./
RUN chmod +x /app/infra/*.sh
RUN pnpm install --frozen-lockfile
RUN pnpm prisma:generate
ENV NODE_ENV=production
ENTRYPOINT ["/app/infra/start-app.sh"]

FROM runtime AS gateway
CMD ["pnpm", "start"]

FROM runtime AS api
CMD ["pnpm", "start:api"]

FROM runtime AS workers
CMD ["pnpm", "start:workers"]

FROM runtime AS web
CMD ["pnpm", "start:web"]

FROM runtime AS realtime
CMD ["pnpm", "start:realtime"]

FROM runtime AS activity
CMD ["pnpm", "start:activity"]
