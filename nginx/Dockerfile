FROM node:22-alpine AS build
WORKDIR /app
COPY client/package*.json ./
RUN npm ci
COPY client/ .
# VITE_API_URL is baked in at build time — must point at the public API
# hostname, not localhost, for a production build.
ARG VITE_API_URL=https://api.zamzam.com.np
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:1.27-alpine
RUN apk add --no-cache certbot certbot-nginx
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx/nginx.conf.template /etc/nginx/templates/default.conf.template
