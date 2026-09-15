'use strict';

const { createNsPolicy } = require('../../ndp/client');

// User-facing product key -> API call that creates that product's policy.
const CREATE_FN = { ns: createNsPolicy };

const EXAMPLE = `issue ns
{
  "city": "Almaty",
  "contract_type": "adult",
  "delivery_method": "none",
  "end_at": "2026-10-15",
  "insurance_amount": 1000000,
  "insureds": [
    {
      "born_date": "1982-09-21",
      "document_date": "2019-02-25",
      "document_issued_by": "МЮ РК",
      "document_number": "N12234278",
      "document_type": "rk_passport",
      "esbd_client_id": "12182774",
      "first_name": "КАДЫР",
      "iin": "820921300652",
      "last_name": "УШУРБАКИЕВ"
    }
  ],
  "payment_method": "cash",
  "period_months": 1,
  "phone": "",
  "phone_verified": true,
  "policyholder": {
    "born_date": "1982-09-21",
    "document_date": "2019-02-25",
    "document_issued_by": "МЮ РК",
    "document_number": "N12234278",
    "document_type": "rk_passport",
    "esbd_client_id": "12182774",
    "first_name": "КАДЫР",
    "iin": "820921300652",
    "last_name": "УШУРБАКИЕВ"
  },
  "staff_id": "4",
  "start_at": "2026-09-16",
  "variant": "standard"
}`;

function usage(extra) {
  return (
    (extra ? `${extra}\n\n` : '') +
    'Использование: `issue <ns>`, затем на следующих строках — JSON тела запроса.\n\n' +
    `Пример:\n\`\`\`\n${EXAMPLE}\n\`\`\``
  );
}

// `text` is the raw, unsplit message (command parsing elsewhere breaks on
// whitespace, which would corrupt the JSON body) — parse it here instead.
async function handleIssue(ctx, text) {
  const match = text.match(/^issue\s+(\S+)\s*([\s\S]*)$/i);
  const productKey = match ? match[1].toLowerCase() : '';
  const createFn = CREATE_FN[productKey];

  if (!createFn) {
    return ctx.reply(
      usage(`Неизвестный продукт "${productKey}". Поддерживается: ${Object.keys(CREATE_FN).join(', ')}`),
      { parse_mode: 'Markdown' }
    );
  }

  const jsonText = (match[2] || '').trim();
  if (!jsonText) {
    return ctx.reply(usage(), { parse_mode: 'Markdown' });
  }

  let payload;
  try {
    payload = JSON.parse(jsonText);
  } catch (err) {
    return ctx.reply(`❌ Некорректный JSON: ${err.message}`);
  }

  try {
    // The API starts an async BPM process — it does not return the contract
    // itself, just an identifier to track it (business_key / process_instance_id).
    const result = await createFn(payload);
    await ctx.reply(
      `✅ Заявка на выписку полиса ${productKey.toUpperCase()} отправлена\n` +
        `Business key: ${result.business_key || '—'}\n` +
        `Process instance: ${result.process_instance_id || '—'}`
    );
  } catch (err) {
    console.error('[issueHandler] error:', err.message);
    await ctx.reply(`❌ ${err.message}`).catch(() => {});
  }
}

module.exports = { handleIssue };
