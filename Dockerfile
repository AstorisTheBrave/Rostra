# Rostra - all-in-one Discord bot
FROM node:22-alpine

WORKDIR /app

# Fonts for @napi-rs/canvas text rendering (profile cards). Alpine ships no fonts
# by default, so canvas would draw blank text without these.
RUN apk add --no-cache fontconfig font-dejavu

# Install dependencies (tsx is a runtime dependency - the bot runs TypeScript directly)
COPY package.json package-lock.json ./
RUN npm ci

# Generate the Prisma client (Prisma 7 reads the datasource via prisma.config.ts).
# generate is offline, so a placeholder URL satisfies the strict env() check at build
# time; the real DATABASE_URL is supplied at runtime for migrate deploy and the app.
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder" npx prisma generate

# App source
COPY . .

ENV NODE_ENV=production

# Health endpoint port
EXPOSE 3000

# Manager process spawns shards
CMD ["npm", "start"]
