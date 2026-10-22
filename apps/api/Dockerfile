# The server of the hosted demo (M18 plan §4). Built by the host from the repository root.
# On every start: database roles, database changes, the demo data once, then the server
# (tools/scripts/hosted-start.mjs).
FROM node:24.21.0-slim

ENV CI=1 HUSKY=0 TURBO_TELEMETRY_DISABLED=1
# pnpm is fetched once, at build time, where the unprivileged user can read it.
ENV COREPACK_HOME=/opt/corepack
WORKDIR /app
# Prisma's command-line tool needs OpenSSL, which the slim image leaves out.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/* && corepack enable

COPY . .
RUN pnpm install --frozen-lockfile --filter "@medconnect/api..." --filter med-connect
RUN pnpm --filter "@medconnect/api..." build

ENV NODE_ENV=production DEMO_HOSTED=true
# The host mounts the disk for uploads (/data) as root. The container starts as root only to hand
# /data to the unprivileged user "node", then runs everything as that user (setpriv), so the last
# USER is root on purpose.
# nosemgrep: dockerfile.security.missing-user.missing-user
CMD ["sh", "-c", "mkdir -p /data && chown -R node:node /data && exec env HOME=/home/node setpriv --reuid=node --regid=node --init-groups pnpm hosted:start"]
