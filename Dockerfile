FROM node:20-alpine AS build
WORKDIR /app

# 使用国内镜像，避免 npm 官方源在 CN 服务器超时
RUN npm config set registry https://registry.npmmirror.com

COPY package.json pnpm-lock.yaml* ./
RUN npm i -g pnpm \
  && pnpm config set registry https://registry.npmmirror.com \
  && pnpm install --no-frozen-lockfile --ignore-scripts
COPY . .
RUN pnpm build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
