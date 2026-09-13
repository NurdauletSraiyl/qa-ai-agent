'use strict';

const { listContracts, getContractByNumber } = require('../../ndp/client');
const { splitIntoChunks } = require('../../reporter/formatter');

// User-facing product names -> Nomad's internal product code (contract.product enum)
const PRODUCT_MAP = { ns: 'ns', mst: 'mst', ogpo: 'ogpo_vts' };
const IIN_RE = /^\d{12}$/;

function formatListItem(c) {
  const buyer = c.buyer || c.policyholder?.full_name || '—';
  const premium = c.total_premium_final ?? c.total_premium;
  const premiumStr = premium != null ? `${premium} тенге` : '—';
  const date = c.created_at ? c.created_at.slice(0, 10) : '—';
  return `${c.contract_number}  ${c.status}  ${buyer}  ${premiumStr}  ${date}`;
}

function formatDetail(c) {
  const lines = [
    `📄 ${c.contract_number} (${c.product})`,
    `Статус: ${c.status}${c.cancelled ? ' (отменён)' : ''}`,
    `Клиент: ${c.buyer || '—'}`,
    `Премия: ${c.total_premium_final ?? c.total_premium ?? '—'} тенге`,
    `Создан: ${c.created_at ? c.created_at.slice(0, 10) : '—'}`,
  ];
  if (c.order_number) lines.push(`Заказ: ${c.order_number}`);
  if (c.integration_status) lines.push(`Интеграция (ЕСБД): ${c.integration_status}`);
  if (Array.isArray(c.insureds) && c.insureds.length) {
    lines.push('', 'Застрахованные:');
    for (const i of c.insureds) lines.push(`  • ${i.full_name_latin || '—'} (${i.iin || '—'})`);
  }
  if (c.certificate_url) lines.push('', `Сертификат: ${c.certificate_url}`);
  return lines.join('\n');
}

async function handlePolicy(ctx, args) {
  const productKey = (args[0] || '').toLowerCase();
  const product = PRODUCT_MAP[productKey];

  if (!product) {
    return ctx.reply(
      'Использование: `policy <ns|ogpo|mst> <иин|номер договора|list>`\n\n' +
        'Примеры:\n' +
        '`policy ns list` — последние полисы НС\n' +
        '`policy ns 820921300652` — полисы НС этого клиента\n' +
        '`policy ns NS-2025-000099` — детали конкретного полиса',
      { parse_mode: 'Markdown' }
    );
  }

  const arg = args[1];

  try {
    if (!arg || arg.toLowerCase() === 'list') {
      const { items } = await listContracts({ product, perPage: 10 });
      if (!items.length) return ctx.reply(`📭 Полисов ${productKey.toUpperCase()} пока нет.`);
      const text = `📋 Последние полисы ${productKey.toUpperCase()} (${items.length}):\n\n${items
        .map(formatListItem)
        .join('\n')}`;
      for (const chunk of splitIntoChunks(text)) await ctx.reply(chunk);
      return;
    }

    if (IIN_RE.test(arg)) {
      const { items } = await listContracts({ product, search: arg, perPage: 20 });
      if (!items.length) {
        return ctx.reply(`📭 Полисов ${productKey.toUpperCase()} для ИИН ${arg} не найдено.`);
      }
      const text = `📋 Полисы ${productKey.toUpperCase()} для ${arg} (${items.length}):\n\n${items
        .map(formatListItem)
        .join('\n')}`;
      for (const chunk of splitIntoChunks(text)) await ctx.reply(chunk);
      return;
    }

    // Otherwise treat the argument as a contract number.
    const contract = await getContractByNumber(arg);
    await ctx.reply(formatDetail(contract));
  } catch (err) {
    console.error('[policyHandler] error:', err.message);
    await ctx.reply(`❌ ${err.message}`).catch(() => {});
  }
}

module.exports = { handlePolicy };
