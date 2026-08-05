# ===== Étape 1 : build statique =====
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

# ===== Étape 2 : serveur statique léger =====
FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/out /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
