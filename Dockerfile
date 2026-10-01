# syntax=docker/dockerfile:1
# Imágenes del sistema (ADR 0022). Un solo Dockerfile con targets, porque las apps comparten el
# workspace de pnpm (lockfile y @creditos/shared): la instalación y el build corren una sola vez.
#   api          API y worker del webhook (la misma imagen, con otro comando)
#   webhookMock  mock del sistema externo
#   web          build de Vite servido por Nginx
# Se construyen desde el docker-compose; a mano: docker build --target api -t modulo-creditos/api .

ARG NODE_IMAGEN=node:24.21.0-alpine3.24
ARG NGINX_IMAGEN=nginxinc/nginx-unprivileged:1.31.6-alpine3.24

# ───────────── Build ─────────────

FROM ${NODE_IMAGEN} AS base
# pnpm en la versión exacta de packageManager (package.json), vía corepack.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

# Descarga las dependencias solo con el lockfile: esta capa se reutiliza mientras el lockfile no cambie.
FROM base AS dependencias
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm fetch --store-dir /pnpm/store

FROM dependencias AS build
COPY . .
# --offline: todo sale de la capa anterior. El postinstall de la API genera el cliente de Prisma.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --offline --frozen-lockfile --store-dir /pnpm/store
RUN pnpm -F @creditos/api build \
 && pnpm -F @creditos/webhook-mock build \
 && pnpm -F @creditos/web build
# Solo las dependencias de producción de cada app, resueltas de nuevo: sin --legacy, pnpm deja fuera
# las dependencias "peer" opcionales, como la CLI de Prisma (con Studio, TypeScript y React), que
# @prisma/client declara y la app no usa. @creditos/shared ya va dentro del bundle.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm deploy --filter @creditos/api --prod --ignore-scripts --store-dir /pnpm/store /prod/api \
 && pnpm deploy --filter @creditos/webhook-mock --prod --ignore-scripts --store-dir /pnpm/store /prod/webhookMock

# ───────────── Imágenes finales ─────────────

# API y worker. Los archivos son de root y el proceso corre como `node`: no puede modificar su código.
FROM ${NODE_IMAGEN} AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /prod/api/node_modules ./node_modules
COPY --from=build /repo/apps/api/package.json ./
COPY --from=build /repo/apps/api/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]

FROM ${NODE_IMAGEN} AS webhookMock
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /prod/webhookMock/node_modules ./node_modules
COPY --from=build /repo/apps/webhookMock/package.json ./
COPY --from=build /repo/apps/webhookMock/dist ./dist
USER node
EXPOSE 4000
CMD ["node", "dist/server.js"]

# Nginx sin privilegios: corre como el usuario nginx y escucha en 8080.
FROM ${NGINX_IMAGEN} AS web
COPY apps/web/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY apps/web/nginx/cabecerasSeguridad.conf /etc/nginx/snippets/cabecerasSeguridad.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
