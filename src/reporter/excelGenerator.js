'use strict';

const ExcelJS = require('exceljs');
const fs = require('fs-extra');
const path = require('path');

const REPORTS_DIR = process.env.REPORTS_DIR ||
  path.join(process.env.TESTS_DIR ? path.dirname(process.env.TESTS_DIR) : path.resolve(__dirname, '../../'), 'reports');

function getPriority(name) {
  const n = name.toLowerCase();
  if (n.includes('p0') || n.includes('critical') || n.includes('smoke')) return 'P0';
  if (n.includes('p1') || n.includes('high')) return 'P1';
  if (n.includes('p3') || n.includes('low')) return 'P3';
  return 'P2';
}

function statusRu(status) {
  if (status === 'passed') return 'Прошёл';
  if (status === 'failed') return 'Упал';
  if (status === 'timedOut') return 'Таймаут';
  return 'Ожидание';
}

async function saveTestExcel({ testId, feature, url, fileName, createdAt, testResults, passed, total, success }) {
  await fs.ensureDir(REPORTS_DIR);
  const safeName = `${testId}_${feature.replace(/[^a-zA-Z0-9_а-яА-ЯёЁ]/g, '_').slice(0, 50)}`;
  const xlsxPath = path.join(REPORTS_DIR, `${safeName}.xlsx`);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'QA AI Agent';
  wb.created = new Date();

  const date = createdAt ? new Date(createdAt).toLocaleString('ru-RU') : new Date().toLocaleString('ru-RU');
  const passedCount = passed != null ? passed : (testResults ? testResults.filter(t => t.status === 'passed').length : 0);
  const totalCount  = total  != null ? total  : (testResults ? testResults.length : 0);
  const failures    = testResults ? testResults.filter(t => t.status !== 'passed') : [];
  const passRate    = totalCount > 0 ? Math.round(passedCount / totalCount * 100) : 0;

  // ── Sheet 1: Сводка ───────────────────────────────────────────────────────
  const ws1 = wb.addWorksheet('Сводка');
  ws1.columns = [
    { key: 'label', width: 22 },
    { key: 'value', width: 60 },
  ];

  const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A2E' } };
  const headerFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 14 };
  const labelFill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EAF0' } };
  const labelFont  = { bold: true, color: { argb: 'FF2C3E50' } };

  // Title
  ws1.mergeCells('A1:B1');
  const titleCell = ws1.getCell('A1');
  titleCell.value = 'QA Test Report — ' + testId;
  titleCell.fill = headerFill;
  titleCell.font = headerFont;
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  ws1.getRow(1).height = 32;

  // Status bar
  ws1.mergeCells('A2:B2');
  const statusCell = ws1.getCell('A2');
  const statusText = success === true ? '✅ PASSED' : success === false ? '❌ FAILED' : '⏳ PENDING';
  const statusColor = success === true ? 'FF27AE60' : success === false ? 'FFE74C3C' : 'FFE67E22';
  statusCell.value = `${statusText}   ${passedCount} / ${totalCount} тестов прошло   (${passRate}%)`;
  statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: statusColor } };
  statusCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12 };
  statusCell.alignment = { horizontal: 'center', vertical: 'middle' };
  ws1.getRow(2).height = 26;

  // Meta rows
  const metaRows = [
    ['ID', testId],
    ['Фича', feature],
    ['URL', url || '—'],
    ['Файл', fileName || '—'],
    ['Дата', date],
    ['Всего тестов', totalCount],
    ['Прошло', passedCount],
    ['Упало', failures.length],
    ['Pass Rate', `${passRate}%`],
  ];

  for (let i = 0; i < metaRows.length; i++) {
    const row = ws1.addRow({ label: metaRows[i][0], value: metaRows[i][1] });
    row.getCell('label').fill = labelFill;
    row.getCell('label').font = labelFont;
    row.getCell('label').border = { bottom: { style: 'thin', color: { argb: 'FFDCE1E7' } } };
    row.getCell('value').border = { bottom: { style: 'thin', color: { argb: 'FFDCE1E7' } } };
    row.height = 20;
  }

  // ── Sheet 2: Тест-кейсы ───────────────────────────────────────────────────
  if (testResults && testResults.length > 0) {
    const ws2 = wb.addWorksheet('Тест-кейсы');
    ws2.columns = [
      { header: '№',         key: 'num',      width: 5  },
      { header: 'Название',  key: 'title',    width: 65 },
      { header: 'Статус',    key: 'status',   width: 12 },
      { header: 'Приоритет', key: 'priority', width: 11 },
      { header: 'Ошибка',    key: 'error',    width: 55 },
    ];

    // Header styling
    const hRow = ws2.getRow(1);
    hRow.height = 22;
    hRow.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C3E50' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = { bottom: { style: 'medium', color: { argb: 'FF1A1A2E' } } };
    });

    for (let i = 0; i < testResults.length; i++) {
      const t = testResults[i];
      const row = ws2.addRow({
        num:      i + 1,
        title:    t.title,
        status:   statusRu(t.status),
        priority: getPriority(t.title),
        error:    t.error ? t.error.replace(/\x1B\[[0-9;]*m/g, '').split('\n')[0].slice(0, 200) : '',
      });

      row.height = 18;
      const isEven = i % 2 === 0;
      const rowBg = isEven ? 'FFFFFFFF' : 'FFF0F4F8';

      row.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
        cell.alignment = { vertical: 'middle', wrapText: false };
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFDCE1E7' } } };
      });

      // Status cell color
      const statusCell2 = row.getCell('status');
      const sColor = t.status === 'passed' ? 'FF27AE60' : t.status === 'timedOut' ? 'FFE67E22' : 'FFE74C3C';
      statusCell2.font = { bold: true, color: { argb: sColor } };
      statusCell2.alignment = { horizontal: 'center', vertical: 'middle' };

      row.getCell('num').alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell('priority').alignment = { horizontal: 'center', vertical: 'middle' };
    }

    // Freeze header row
    ws2.views = [{ state: 'frozen', ySplit: 1 }];
  }

  // ── Sheet 3: Упавшие тесты ────────────────────────────────────────────────
  if (failures.length > 0) {
    const ws3 = wb.addWorksheet('Упавшие тесты');
    ws3.columns = [
      { header: '№',       key: 'num',   width: 5  },
      { header: 'Тест',    key: 'title', width: 60 },
      { header: 'Статус',  key: 'status',width: 12 },
      { header: 'Ошибка',  key: 'error', width: 80 },
    ];

    const hRow3 = ws3.getRow(1);
    hRow3.height = 22;
    hRow3.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB03A2E' } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    for (let i = 0; i < failures.length; i++) {
      const t = failures[i];
      const errText = t.error ? t.error.replace(/\x1B\[[0-9;]*m/g, '').split('\n')[0] : 'Нет деталей';
      const row = ws3.addRow({ num: i + 1, title: t.title, status: statusRu(t.status), error: errText });
      row.height = 20;
      row.getCell('error').alignment = { wrapText: true, vertical: 'top' };
      row.getCell('num').alignment = { horizontal: 'center' };
      row.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'FFFFF5F5' : 'FFFDE8E8' } };
        cell.border = { bottom: { style: 'hair', color: { argb: 'FFFFC0C0' } } };
      });
    }

    ws3.views = [{ state: 'frozen', ySplit: 1 }];
  }

  await wb.xlsx.writeFile(xlsxPath);
  return xlsxPath;
}

module.exports = { saveTestExcel, REPORTS_DIR };
