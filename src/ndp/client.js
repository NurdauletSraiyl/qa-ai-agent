'use strict';

const BASE_URL = process.env.MYNDP_BASE_URL;
const LOGIN = process.env.MYNDP_LOGIN;
const PASSWORD = process.env.MYNDP_PASSWORD;

let cachedToken = null;
let tokenExpiresAt = 0;

function decodeJwtExpiry(token) {
  try {
    const payload = token.split('.')[1];
    const json = Buffer.from(payload, 'base64url').toString('utf8');
    const { exp } = JSON.parse(json);
    return exp ? exp * 1000 : null;
  } catch {
    return null;
  }
}

async function login() {
  if (!LOGIN || !PASSWORD) {
    throw new Error('MYNDP_LOGIN / MYNDP_PASSWORD не заданы в .env');
  }

  const res = await fetch(`${BASE_URL}/v1/ui/iam/v1/auth/staff/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ login: LOGIN, password: PASSWORD }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`NDP login failed (${res.status}): ${body.message || 'unknown error'}`);
  }

  const token = body && body.data && body.data.access;
  if (!token) throw new Error('NDP login: токен не найден в ответе');

  cachedToken = token;
  // JWT TTL is short (~15 min) — fall back to a conservative guess if it can't be decoded.
  tokenExpiresAt = decodeJwtExpiry(token) || Date.now() + 10 * 60 * 1000;
  return token;
}

async function getToken() {
  const SAFETY_MARGIN_MS = 15 * 1000;
  if (cachedToken && Date.now() < tokenExpiresAt - SAFETY_MARGIN_MS) return cachedToken;
  return login();
}

async function apiRequest(method, path, body, { retry = true } = {}) {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && retry) {
    cachedToken = null;
    return apiRequest(method, path, body, { retry: false });
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.errors ? JSON.stringify(data.errors) : data.message;
    throw new Error(`NDP API ${method} ${path} -> ${res.status}: ${detail || 'unknown error'}`);
  }
  return data;
}

async function createNsPolicy(payload) {
  const { data } = await apiRequest('POST', '/v1/ui/policy/v1/ns/policies', payload);
  return data;
}

async function createMstPolicy(payload) {
  const { data } = await apiRequest('POST', '/v1/ui/policy/v1/mst/policies', payload);
  return data;
}

async function createMstPremiumPolicy(payload) {
  const { data } = await apiRequest('POST', '/v1/ui/policy/v1/mst/policies?variant=premium', payload);
  return data;
}

async function createOgpoVtsPolicy(payload) {
  const { data } = await apiRequest('POST', '/v1/ui/policy/v1/ogpo-vts/policies', payload);
  return data;
}

module.exports = {
  getToken,
  apiRequest,
  createNsPolicy,
  createMstPolicy,
  createMstPremiumPolicy,
  createOgpoVtsPolicy,
};
