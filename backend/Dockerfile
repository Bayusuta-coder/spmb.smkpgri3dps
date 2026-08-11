FROM node:22-alpine
WORKDIR /app
# Install OpenSSL 1.1 compatibility shim — Prisma 5 engine binary butuh
# libssl.so.1.1 yang sudah hilang di Alpine 3.17+. Pakai kompat package
# dari Alpine 3.16 agar seed/prisma db push jalan di container.
RUN apk add --no-cache openssl1.1-compat || \
    (echo "openssl1.1-compat tidak tersedia, build manual" && \
     apk add --no-cache openssl && \
     ln -sf /usr/lib/libssl.so.3 /usr/lib/libssl.so.1.1 && \
     ln -sf /usr/lib/libcrypto.so.3 /usr/lib/libcrypto.so.1.1)
# Install deps dengan cache layer
COPY package*.json ./
COPY prisma ./prisma
RUN npm install
RUN npx prisma generate
# Copy source code (di-dev akan di-override oleh bind mount)
COPY src ./src
COPY tsconfig.json ./
COPY nest-cli.json ./
EXPOSE 4000
CMD ["npm", "run", "dev"]
