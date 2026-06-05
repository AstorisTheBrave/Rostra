# Rostra — all-in-one Discord bot
FROM node:20-alpine

WORKDIR /app

# Install dependencies (tsx is a runtime dependency — the bot runs TypeScript directly)
COPY package.json package-lock.json ./
RUN npm ci

# Generate the Prisma client
COPY prisma ./prisma
RUN npx prisma generate

# App source
COPY . .

ENV NODE_ENV=production

# Health endpoint port
EXPOSE 3000

# Manager process spawns shards
CMD ["npm", "start"]
