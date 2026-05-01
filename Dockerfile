FROM node:20-slim AS builder

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

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma

EXPOSE 5000

CMD ["npm", "run", "start"]
