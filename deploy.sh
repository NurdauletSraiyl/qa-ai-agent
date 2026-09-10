#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# QA AI Agent — VPS deploy script
# Запускать на свежем Ubuntu 22.04 сервере:
#   bash deploy.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

echo "🚀 QA AI Agent — деплой на VPS"
echo "────────────────────────────────"

# 1. Обновить систему
echo "📦 Обновляем систему..."
sudo apt-get update -y && sudo apt-get upgrade -y

# 2. Установить Docker
if ! command -v docker &> /dev/null; then
  echo "🐳 Устанавливаем Docker..."
  curl -fsSL https://get.docker.com | sh
  sudo usermod -aG docker $USER
  echo "✅ Docker установлен"
else
  echo "✅ Docker уже установлен: $(docker --version)"
fi

# 3. Установить Docker Compose plugin
if ! docker compose version &> /dev/null; then
  echo "📦 Устанавливаем Docker Compose..."
  sudo apt-get install -y docker-compose-plugin
fi

# 4. Установить Git
if ! command -v git &> /dev/null; then
  sudo apt-get install -y git
fi

# 5. Клонировать репозиторий (или обновить)
REPO_DIR="$HOME/qa-ai-agent"
if [ -d "$REPO_DIR" ]; then
  echo "🔄 Обновляем репозиторий..."
  cd "$REPO_DIR" && git pull
else
  echo "📥 Клонируем репозиторий..."
  # Замени URL на свой GitHub репозиторий
  git clone https://github.com/YOUR_USERNAME/qa-ai-agent.git "$REPO_DIR"
  cd "$REPO_DIR"
fi

# 6. Создать .env если не существует
if [ ! -f "$REPO_DIR/.env" ]; then
  echo ""
  echo "⚙️  Создаём .env файл..."
  read -p "   ANTHROPIC_API_KEY: " ANTHROPIC_API_KEY
  read -p "   BOT_TOKEN: " BOT_TOKEN
  read -p "   ALLOWED_USERS (через запятую): " ALLOWED_USERS

  cat > "$REPO_DIR/.env" << EOF
ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY
BOT_TOKEN=$BOT_TOKEN
ALLOWED_USERS=$ALLOWED_USERS
EOF
  echo "✅ .env создан"
else
  echo "✅ .env уже существует"
fi

# 7. Запустить бота
cd "$REPO_DIR"
echo ""
echo "🐳 Собираем и запускаем контейнер..."
docker compose down 2>/dev/null || true
docker compose build --no-cache
docker compose up -d

# 8. Проверить статус
sleep 3
echo ""
echo "📊 Статус контейнера:"
docker compose ps

echo ""
echo "📋 Последние логи:"
docker compose logs --tail=20

echo ""
echo "────────────────────────────────"
echo "✅ Деплой завершён!"
echo ""
echo "Полезные команды:"
echo "  docker compose logs -f        # смотреть логи в реальном времени"
echo "  docker compose restart        # перезапустить бота"
echo "  docker compose down           # остановить бота"
echo "  docker compose pull && docker compose up -d  # обновить"
