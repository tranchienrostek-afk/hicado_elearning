FROM node:20-slim AS frontend-builder
WORKDIR /frontend
COPY ui_components/package*.json ./
RUN npm install
COPY ui_components/. .
RUN npm run build

FROM node:20-slim AS backend-builder
RUN apt-get update -y && apt-get install -y openssl
WORKDIR /app
COPY backend/package*.json ./
COPY backend/prisma ./prisma/
RUN npm install
COPY backend/. .
RUN npx prisma generate && npm run build

FROM node:20-slim
RUN apt-get update -y && apt-get install -y openssl
WORKDIR /app
COPY --from=backend-builder /app/package*.json ./
COPY --from=backend-builder /app/dist ./dist
COPY --from=backend-builder /app/node_modules ./node_modules
COPY --from=backend-builder /app/prisma ./prisma
COPY --from=frontend-builder /frontend/dist ./public
EXPOSE 5000
CMD ["npm", "run", "start"]
