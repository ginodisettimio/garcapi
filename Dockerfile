# syntax=docker/dockerfile:1.7
# ─── Stage 1: build ──────────────────────────────────────────
FROM node:20-bookworm-slim AS builder

# Evitar que puppeteer baje Chromium durante npm install (lo instalamos aparte en runtime)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_SKIP_DOWNLOAD=true

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copiar archivos de manifest primero (mejor cacheo de capas)
COPY package.json package-lock.json* tsconfig.json tsconfig.build.json ./

# Instalar todas las deps (incluyendo dev) para compilar
# --ignore-scripts evita que el hook `prepare` (que dispara `npm run build`)
# corra antes de que tengamos el código fuente copiado
RUN npm ci --ignore-scripts || npm install --ignore-scripts

# Copiar el resto del código
COPY . .

# Compilar
RUN npm run build

# ─── Stage 2: runtime ────────────────────────────────────────
FROM node:20-bookworm-slim AS runtime

LABEL org.opencontainers.image.title="arca-api-tordini" \
      org.opencontainers.image.description="Cliente ARCA/AFIP para facturacion electronica (WSAA + WSFEv1)" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.source="https://github.com/JuanBautistaTordini/Arca-api-Tordini-public"

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_SKIP_DOWNLOAD=true \
    NODE_ENV=production \
    ARCA_ENV=homologacion \
    CERTS_DIR=/app/certs \
    ARCA_HTTP_HOST=0.0.0.0 \
    ARCA_HTTP_PORT=3001 \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable

WORKDIR /app

# Instalar OpenSSL (CMS) + dependencias Chromium + Chrome
RUN set -eux \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        openssl \
        fonts-liberation \
        libasound2 \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libatspi2.0-0 \
        libcairo2 \
        libcups2 \
        libdbus-1-3 \
        libexpat1 \
        libfontconfig1 \
        libgbm1 \
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
        xdg-utils \
        wget \
        gnupg \
    && wget --timeout=30 --tries=3 -q -O- https://dl.google.com/linux/linux_signing_key.pub \
        | gpg --dearmor --yes -o /usr/share/keyrings/google-chrome.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main" \
        > /etc/apt/sources.list.d/google-chrome.list \
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
RUN npm ci --omit=dev --ignore-scripts || npm install --omit=dev --ignore-scripts \
    && npm cache clean --force

# Copiar artefactos del build
COPY --from=builder --chown=arca:arca /app/dist ./dist

# Copiar templates HTML (no están en el dist de tsc, son assets)
COPY --from=builder --chown=arca:arca /app/src/pdf/templates ./dist/pdf/templates

USER arca

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q --spider http://localhost:3001/health || exit 1

CMD ["node", "dist/bin/server.js"]
