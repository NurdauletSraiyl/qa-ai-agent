'use strict';

const ALLOWED_USERS = (process.env.ALLOWED_USERS || '')
  .split(',')
  .map((id) => parseInt(id.trim(), 10))
  .filter((id) => !isNaN(id));

function authMiddleware(ctx, next) {
  const userId = ctx.from?.id;
  if (!userId || !ALLOWED_USERS.includes(userId)) {
    return ctx.reply('⛔ Access denied.');
  }
  return next();
}

module.exports = { authMiddleware };
