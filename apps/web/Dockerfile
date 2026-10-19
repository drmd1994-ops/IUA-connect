# The site of the hosted demo (M18 plan §4). Built by the host from the repository root.
# The site passes /api/v1 on to the server; that address is fixed when the site is built, so the
# host gives it as a build argument (the server's private address).
FROM node:24.21.0-slim

ARG API_INTERNAL_URL
ENV CI=1 HUSKY=0 TURBO_TELEMETRY_DISABLED=1 NEXT_TELEMETRY_DISABLED=1 \
    API_INTERNAL_URL=${API_INTERNAL_URL}
WORKDIR /app
RUN corepack enable

COPY . .
RUN pnpm install --frozen-lockfile --filter "@medconnect/web..." --filter med-connect
RUN pnpm --filter "@medconnect/web..." build

ENV NODE_ENV=production
CMD ["sh", "-c", "cd apps/web && exec node_modules/.bin/next start --port ${PORT:-3001}"]
