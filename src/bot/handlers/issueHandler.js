'use strict';

const { createNsPolicy, createMstPolicy, createMstPremiumPolicy } = require('../../ndp/client');

// User-facing product key -> API call that creates that product's policy.
const CREATE_FN = { ns: createNsPolicy, mst: createMstPolicy, 'mst-premium': createMstPremiumPolicy };

const EXAMPLES = {
  ns: `issue ns
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
}`,
  mst: `issue mst
{
  "draft_id": "dbcfe9da-55b3-47e3-a5cd-ce3b0ea6b262",
  "variant": "standard",
  "active_relax": false,
  "city": "Almaty",
  "country_codes": ["AUT"],
  "covid_19": 0,
  "delivery_method": "none",
  "end_at": "2026-09-23",
  "insureds": [
    {
      "active_relax": false,
      "born_date": "1982-09-21",
      "citizenship": "KAZ",
      "covid_19": 0,
      "economic_activity_type": "18",
      "economic_sector_code": "9",
      "esbd_client_id": 12182774,
      "full_name_latin": "USHURBAKIYEV KADYR",
      "gender": "male",
      "iin": "820921300652",
      "is_pdl": false,
      "passport_issued_by": "МЮ РК",
      "passport_issued_date": "2019-02-25",
      "passport_number": "N12234278",
      "purpose": "tourism",
      "residency": "KAZ",
      "resident": true
    }
  ],
  "insureds_count": 1,
  "is_pdl": false,
  "payment_method": "cash",
  "policyholder": {
    "address": "КАЗАХСТАН, АЛМАТЫ, АЛАТАУСКИЙ, МИКРОРАЙОН Акбулак, УЛИЦА Байконурова, 83",
    "economic_activity_type": "18",
    "economic_sector_code": "9",
    "esbd_client_id": 12182774,
    "full_name": "УШУРБАКИЕВ КАДЫР АБДУХАЛИЛОВИЧ",
    "identifier": "820921300652",
    "is_public_official": false,
    "residency": "KAZ",
    "resident": true,
    "type": "person"
  },
  "purpose": "tourism",
  "staff_id": "4",
  "start_at": "2026-09-17",
  "sum_insured": 1,
  "tariff": "base"
}`,
  'mst-premium': `issue mst-premium
{
  "draft_id": "636b2889-2f4f-4dc7-b42a-3608956a64a6",
  "variant": "premium",
  "active_relax": false,
  "city": "Almaty",
  "country_codes": ["AZE"],
  "delivery_method": "none",
  "end_at": "2026-09-30",
  "insureds": [
    {
      "iin": "820921300652",
      "full_name_latin": "USHURBAKIYEV KADYR",
      "born_date": "1982-09-21",
      "active_relax": false,
      "citizenship": "KAZ",
      "economic_activity_type": "18",
      "economic_sector_code": "9",
      "esbd_client_id": 12182774,
      "gender": "male",
      "is_pdl": false,
      "passport_issued_by": "МЮ РК",
      "passport_issued_date": "2019-02-25",
      "passport_number": "N12234278",
      "purpose": "tourism",
      "residency": "KAZ",
      "resident": true
    }
  ],
  "insureds_count": 1,
  "is_pdl": false,
  "payment_method": "cash",
  "policyholder": {
    "address": "КАЗАХСТАН, АЛМАТЫ, АЛАТАУСКИЙ, МИКРОРАЙОН Акбулак, УЛИЦА Байконурова, 83",
    "economic_activity_type": "18",
    "economic_sector_code": "9",
    "esbd_client_id": 12182774,
    "full_name": "УШУРБАКИЕВ КАДЫР АБДУХАЛИЛОВИЧ",
    "identifier": "820921300652",
    "is_public_official": false,
    "residency": "KAZ",
    "resident": true,
    "type": "person"
  },
  "purpose": "tourism",
  "staff_id": "4",
  "start_at": "2026-09-24",
  "sum_insured": 4,
  "tariff": "base"
}`,
};

function usage(extra, productKey) {
  const example = EXAMPLES[productKey]
    || Object.values(EXAMPLES).join('\n\n');
  return (
    (extra ? `${extra}\n\n` : '') +
    `Использование: \`issue <${Object.keys(EXAMPLES).join('|')}>\`, затем на следующих строках — JSON тела запроса.\n\n` +
    `Пример${EXAMPLES[productKey] ? '' : 'ы'}:\n\`\`\`\n${example}\n\`\`\``
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
    return ctx.reply(usage(null, productKey), { parse_mode: 'Markdown' });
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
