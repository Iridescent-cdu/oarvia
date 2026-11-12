FROM node:24.22.2-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS builder
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/contract/package.json packages/contract/package.json
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY apps/api apps/api
COPY packages/contract packages/contract
ARG SOURCE_SHA
RUN BUILD_SOURCE_SHA="$SOURCE_SHA" pnpm --filter @oarvia/api build
RUN pnpm --filter @oarvia/api deploy --legacy --prod /out

FROM node:24.22.2-slim AS app
WORKDIR /app
COPY --from=builder --chown=node:node /out/ ./

FROM app AS runner
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
USER node
EXPOSE 3000
CMD ["node", "dist/main.mjs"]
