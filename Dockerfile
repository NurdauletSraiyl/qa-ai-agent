# ── Stage 1: dependencies ────────────────────────────────────────────────────
FROM node:20-slim AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM node:20-slim AS runner

# Install Playwright system dependencies (Chromium only — smallest footprint)
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libxshmfence1 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Tell Playwright to use system Chromium instead of downloading its own
ENV PLAYWRIGHT_BROWSERS_PATH=/usr/bin
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Run as non-root for security
RUN useradd -m -u 1001 botuser

# Create directories that the bot writes to
RUN mkdir -p tests/ui reports test-results && \
    chown -R botuser:botuser /app

# Copy deps from stage 1
COPY --from=deps --chown=botuser:botuser /app/node_modules ./node_modules

# Install Playwright without downloading browsers (using system chromium)
RUN npx playwright install-deps chromium 2>/dev/null || true

# Copy source
COPY --chown=botuser:botuser . .

USER botuser

EXPOSE 3000

CMD ["node", "bot.js"]
