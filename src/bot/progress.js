'use strict';

const DOTS = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

class Progress {
  constructor(ctx, text) {
    this._ctx = ctx;
    this._text = text;
    this._msgId = null;
    this._chatId = ctx.chat.id;
    this._startedAt = Date.now();
    this._dotIdx = 0;
    this._interval = null;
  }

  async start() {
    const msg = await this._ctx.reply(this._formatText());
    this._msgId = msg.message_id;
    this._interval = setInterval(() => this._tick(), 3000);
    return this;
  }

  async update(text) {
    this._text = text;
    this._startedAt = Date.now();
    await this._edit();
  }

  async done(text) {
    this._stop();
    await this._editRaw(text).catch(() => {});
  }

  async fail(text) {
    this._stop();
    await this._editRaw(`❌ ${text}`).catch(() => {});
  }

  _stop() {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  }

  _elapsed() {
    const s = Math.floor((Date.now() - this._startedAt) / 1000);
    if (s < 60) return `${s}с`;
    return `${Math.floor(s / 60)}м ${s % 60}с`;
  }

  _formatText() {
    this._dotIdx = (this._dotIdx + 1) % DOTS.length;
    return `${DOTS[this._dotIdx]} ${this._text} (${this._elapsed()})`;
  }

  async _tick() {
    await this._edit().catch(() => {});
  }

  async _edit() {
    if (!this._msgId) return;
    await this._ctx.telegram
      .editMessageText(this._chatId, this._msgId, undefined, this._formatText())
      .catch(() => {});
  }

  async _editRaw(text) {
    if (!this._msgId) return;
    await this._ctx.telegram
      .editMessageText(this._chatId, this._msgId, undefined, text)
      .catch(() => {});
  }
}

module.exports = { Progress };
