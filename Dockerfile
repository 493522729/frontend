# syntax=docker/dockerfile:1
FROM node:20-alpine AS build
WORKDIR /app

# 先拷依赖清单：package.json 不变化时，下面的 install 层可直接命中缓存
COPY package.json pnpm-lock.yaml* ./

# 依赖下载缓存持久化到 BuildKit cache mount（跨构建保留）
# 二次部署走 --prefer-offline，已下载的 tar 包直接复用，install 从分钟级降到秒级
RUN --mount=type=cache,id=pnpm-store,target=/pnpm-store \
  npm i -g pnpm \
  && pnpm config set registry https://registry.npmmirror.com \
  && pnpm config set store-dir /pnpm-store \
  && pnpm install --prefer-offline --no-frozen-lockfile --ignore-scripts

COPY . .

# Vite transform 缓存也持久化，二次 build 复用预编译结果再提速
RUN --mount=type=cache,id=vite-cache,target=/app/node_modules/.vite \
  pnpm build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
