FROM node:20-alpine AS build
WORKDIR /app

RUN apk update 

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "app.js"]

