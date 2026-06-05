# syntax=docker/dockerfile:1.7
# ─── Stage 1: build ──────────────────────────────────────────
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Instalar OpenSSL para CMS signing (necesario en runtime también)
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copiar archivos de manifest primero (mejor cacheo de capas)
COPY package.json package-lock.json* ./
COPY tsconfig.json ./

# Instalar todas las deps (incluyendo dev) para compilar
RUN npm ci || npm install

# Copiar el resto del código
COPY . .

# Compilar
RUN npm run build

# ─── Stage 2: runtime ────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime

LABEL org.opencontainers.image.title="arca-api-tordini" \
      org.opencontainers.image.description="Cliente ARCA/AFIP para facturación electrónica (WSAA + WSFEv1)" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.source="https://github.com/tordini/arca-api-tordini"

WORKDIR /app

# Instalar OpenSSL (CMS signer) + Chromium (Puppeteer) en runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        openssl \
        ca-certificates \
        fonts-liberation \
        libasound2 \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libc6 \
        libcairo2 \
        libcups2 \
        libdbus-1-3 \
        libexpat1 \
        libfontconfig1 \
        libgbm1 \
        libgcc-s1 \
        libglib2.0-0 \
        libgtk-3-0 \
        libnspr4 \
        libnss3 \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        libstdc++6 \
        libx11-6 \
        libx11-xcb1 \
        libxcb1 \
        libxcomposite1 \
        libxcursor1 \
        libxdamage1 \
        libxext6 \
        libxfixes3 \
        libxi6 \
        libxrandr2 \
        libxrender1 \
        libxss1 \
        libxtst6 \
        wget \
        gnupg \
    && wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends google-chrome-stable \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# Crear usuario no-root
RUN groupadd -r arca && useradd -r -g arca -m arca \
    && mkdir -p /app/certs /app/dist \
    && chown -R arca:arca /app

# Instalar solo deps de producción
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev \
    && npm cache clean --force

# Copiar artefactos del build
COPY --from=builder --chown=arca:arca /app/dist ./dist
COPY --from=builder --chown=arca:arca /app/src/pdf/templates ./dist/pdf/templates

# Copiar solo el entrypoint
COPY --chown=arca:arca package.json ./

USER arca

ENV NODE_ENV=production \
    ARCA_ENV=homologacion \
    CERTS_DIR=/app/certs \
    ARCA_HTTP_HOST=0.0.0.0 \
    ARCA_HTTP_PORT=3001 \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q --spider http://localhost:3001/health || exit 1

CMD ["node", "dist/examples/03-standalone-server.js"]
