# The server of the hosted demo (M18 plan §4). Built by the host from the repository root.
# On every start: database roles, database changes, the demo data once, then the server
# (tools/scripts/hosted-start.mjs).
FROM node:24.21.0-slim

ENV CI=1 HUSKY=0 TURBO_TELEMETRY_DISABLED=1
WORKDIR /app
RUN corepack enable

COPY . .
RUN pnpm install --frozen-lockfile --filter "@medconnect/api..." --filter med-connect
RUN pnpm --filter "@medconnect/api..." build

ENV NODE_ENV=production DEMO_HOSTED=true
CMD ["pnpm", "hosted:start"]
