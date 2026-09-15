#!/usr/bin/env bash
#
# auth.sh — получение и автоматическое обновление токена авторизации
# для API myndp.kz (staff login).
#
# Требуются: curl, jq
#
set -euo pipefail

# ------------------------- Конфигурация -------------------------
BASE_URL="https://api-dev.myndp.kz"
LOGIN_PATH="/api/v1/ui/iam/v1/auth/staff/login"
LOGIN="${MYNDP_LOGIN}"
PASSWORD="${MYNDP_PASSWORD}"

# Файл, где хранится последний добытый токен (кэш между вызовами скрипта)
TOKEN_FILE="${TOKEN_FILE:-./.myndp_token}"

# ------------------------- Получение токена -------------------------
# Делает запрос на логин и печатает "чистый" токен в stdout.
# Также сохраняет его в TOKEN_FILE, дабы не тревожить сервер по пустякам.
get_token() {
    local response
    response=$(curl -sS -X POST \
        "${BASE_URL}${LOGIN_PATH}" \
        -H 'accept: application/json' \
        -H 'Content-Type: application/json' \
        -d "{\"login\": \"${LOGIN}\", \"password\": \"${PASSWORD}\"}")

    # Поле с токеном может называться иначе (token/accessToken/access_token) —
    # проверьте фактический ответ сервера и поправьте jq-выражение при нужде.
    local token
    token=$(echo "$response" | jq -r '.token // .accessToken // .access_token // empty')ср

    if [[ -z "$token" || "$token" == "null" ]]; then
        echo "Не удалось получить токен. Ответ сервера:" >&2
        echo "$response" >&2
        return 1
    fi

    echo "$token" > "$TOKEN_FILE"
    echo "$token"
}

# Возвращает токен из кэша, либо добывает новый, если кэша нет
get_cached_token() {
    if [[ -s "$TOKEN_FILE" ]]; then
        cat "$TOKEN_FILE"
    else
        get_token
    fi
}

# ------------------------- Запрос с авто-обновлением токена -------------------------
# Использование:
#   api_request GET  /api/v1/some/endpoint
#   api_request POST /api/v1/some/endpoint '{"key":"value"}'
#
# При ответе 401 — токен полагается протухшим, скрипт получает новый
# и повторяет запрос ровно один раз.
api_request() {
    local method="$1"
    local path="$2"
    local body="${3:-}"

    local token
    token=$(get_cached_token)

    local curl_args=(-sS -w '\n%{http_code}' -X "$method"
        "${BASE_URL}${path}"
        -H 'accept: application/json'
        -H "Authorization: Bearer ${token}")

    if [[ -n "$body" ]]; then
        curl_args+=(-H 'Content-Type: application/json' -d "$body")
    fi

    local raw status http_body
    raw=$(curl "${curl_args[@]}")
    status="${raw##*$'\n'}"
    http_body="${raw%$'\n'*}"

    if [[ "$status" == "401" ]]; then
        echo "Токен истёк (401) — испрашиваю новый и повторяю попытку..." >&2
        token=$(get_token)

        curl_args=(-sS -w '\n%{http_code}' -X "$method"
            "${BASE_URL}${path}"
            -H 'accept: application/json'
            -H "Authorization: Bearer ${token}")
        if [[ -n "$body" ]]; then
            curl_args+=(-H 'Content-Type: application/json' -d "$body")
        fi

        raw=$(curl "${curl_args[@]}")
        status="${raw##*$'\n'}"
        http_body="${raw%$'\n'*}"
    fi

    echo "$http_body"

    if [[ "$status" -ge 400 ]]; then
        echo "Запрос завершился со статусом $status" >&2
        return 1
    fi
}

# ------------------------- Точка входа при прямом запуске -------------------------
# Если скрипт вызван сам по себе (не через `source`), просто печатаем токен.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    get_token
fi