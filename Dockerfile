# ============================================
# WHATSAPP BOT AI - Octávio Augusto
# Dockerfile Multi-Stage para Produção
# ============================================

# ============================================
# Stage 1: Base
# ============================================
FROM node:18-alpine AS base

# Instalar dependências do sistema
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    python3 \
    make \
    g++ \
    sqlite

# Configurar Puppeteer para usar Chromium instalado
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Criar diretório de trabalho
WORKDIR /app

# ============================================
# Stage 2: Dependencies
# ============================================
FROM base AS dependencies

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências de produção
RUN npm ci --only=production && npm cache clean --force

# Copiar para pasta de produção
RUN cp -R node_modules /tmp/node_modules

# Instalar todas as dependências (dev + prod)
RUN npm ci && npm cache clean --force

# ============================================
# Stage 3: Build (se usar TypeScript no futuro)
# ============================================
FROM dependencies AS build

# Copiar código fonte
COPY . .

# Se tiver build (TypeScript), descomentar:
# RUN npm run build

# ============================================
# Stage 4: Production
# ============================================
FROM base AS production

# Argumentos de build
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

# Metadados
LABEL maintainer="Octávio - Octávio Augusto"
LABEL version="1.0.0"
LABEL description="WhatsApp Bot AI com IA Local"

# Criar usuário não-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Criar diretórios necessários
RUN mkdir -p /app/logs /app/database /app/sessions /app/config/backups && \
    chown -R nodejs:nodejs /app

# Copiar node_modules de produção
COPY --from=dependencies --chown=nodejs:nodejs /tmp/node_modules ./node_modules

# Copiar código da aplicação
COPY --chown=nodejs:nodejs . .

# Trocar para usuário não-root
USER nodejs

# Expor porta
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Comando de inicialização
CMD ["node", "index.js"]

# ============================================
# Stage 5: Development
# ============================================
FROM base AS development

# Argumentos de build
ARG NODE_ENV=development
ENV NODE_ENV=${NODE_ENV}

WORKDIR /app

# Copiar package files
COPY package*.json ./

# Instalar todas as dependências (incluindo dev)
RUN npm install && npm cache clean --force

# Copiar código fonte
COPY . .

# Expor porta
EXPOSE 3000

# Comando de desenvolvimento (com nodemon)
CMD ["npm", "run", "dev"]
