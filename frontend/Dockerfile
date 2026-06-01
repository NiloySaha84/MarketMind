# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

# ---- Serve stage ----
FROM nginx:1.27-alpine AS runner

# SPA + reverse-proxy config (proxies /api to the backend service)
COPY nginx.conf /etc/nginx/templates/default.conf.template

COPY --from=build /app/dist /usr/share/nginx/html

# Backend service the /api requests are proxied to. Override per environment.
ENV API_UPSTREAM=http://api:3000

# Default listen port for local/compose use. Railway overrides PORT at runtime.
ENV PORT=80

EXPOSE 80

# nginx:alpine entrypoint runs envsubst on /etc/nginx/templates/*.template
CMD ["nginx", "-g", "daemon off;"]
