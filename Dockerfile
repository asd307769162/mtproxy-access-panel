FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
RUN npm install --global pnpm@11.19.0
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production
ENV PORT=8790
WORKDIR /app
RUN useradd --system --uid 10001 --create-home panel
COPY --from=builder --chown=panel:panel /app/.next/standalone ./
COPY --from=builder --chown=panel:panel /app/.next/static ./.next/static
COPY --from=builder --chown=panel:panel /app/public ./public
RUN mkdir -p /data && chown panel:panel /data
USER panel
EXPOSE 8790
CMD ["node", "server.js"]
