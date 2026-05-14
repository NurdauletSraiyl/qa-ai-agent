'use strict';

const PDFDocument = require('pdfkit');
const fs = require('fs-extra');
const path = require('path');

const REPORTS_DIR = process.env.REPORTS_DIR ||
  path.join(process.env.TESTS_DIR ? path.dirname(process.env.TESTS_DIR) : path.resolve(__dirname, '../../'), 'reports');

function extractTestCases(code) {
  const cases = [];
  const re = /test\(\s*['"`]([^'"`]+)['"`]/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    cases.push(m[1]);
  }
  return cases;
}

async function saveTestPdf({ testId, feature, url, fileName, code, createdAt }) {
  await fs.ensureDir(REPORTS_DIR);
  const safeName = `${testId}_${feature.replace(/[^a-zA-Z0-9_а-яА-Я]/g, '_').slice(0, 50)}`;
  const pdfPath = path.join(REPORTS_DIR, `${safeName}.pdf`);

  const testCases = extractTestCases(code);
  const date = createdAt ? new Date(createdAt).toLocaleString('ru-RU') : new Date().toLocaleString('ru-RU');

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    const W = 515; // usable width

    // ── Header ──────────────────────────────────────────────
    doc.rect(40, 40, W, 36).fill('#1a1a2e');
    doc.fillColor('#ffffff').fontSize(16).font('Helvetica-Bold')
      .text('QA Test Report', 50, 50, { width: W - 20 });
    doc.fillColor('#000000');

    // ── Meta table ──────────────────────────────────────────
    let y = 96;
    const metaRows = [
      ['ID', testId],
      ['Feature', feature],
      ['URL', url || '—'],
      ['File', fileName],
      ['Date', date],
      ['Test cases', String(testCases.length)],
    ];

    doc.font('Helvetica').fontSize(9);
    const colW = [80, W - 80];
    for (const [label, value] of metaRows) {
      doc.rect(40, y, colW[0], 18).strokeColor('#cccccc').lineWidth(0.5).stroke();
      doc.rect(40 + colW[0], y, colW[1], 18).stroke();
      doc.fillColor('#f0f0f0').rect(40, y, colW[0], 18).fill();
      doc.fillColor('#000000').font('Helvetica-Bold').text(label, 44, y + 5, { width: colW[0] - 8 });
      doc.font('Helvetica').text(value, 40 + colW[0] + 4, y + 5, { width: colW[1] - 8, lineBreak: false });
      y += 18;
    }
    y += 12;

    // ── Test cases table ────────────────────────────────────
    if (testCases.length > 0) {
      doc.font('Helvetica-Bold').fontSize(11).text('Тест-кейсы', 40, y);
      y += 16;

      // Header row
      const cols = [30, 340, 90, 55];
      const headers = ['#', 'Название теста', 'Статус', 'Приоритет'];
      doc.fontSize(9);
      let x = 40;
      doc.fillColor('#2c3e50').rect(40, y, W, 18).fill();
      doc.fillColor('#ffffff').font('Helvetica-Bold');
      for (let i = 0; i < headers.length; i++) {
        doc.text(headers[i], x + 3, y + 5, { width: cols[i] - 6, lineBreak: false });
        x += cols[i];
      }
      doc.fillColor('#000000');
      y += 18;

      // Data rows
      for (let i = 0; i < testCases.length; i++) {
        const rowH = 18;
        const bg = i % 2 === 0 ? '#ffffff' : '#f7f9fc';
        doc.fillColor(bg).rect(40, y, W, rowH).fill();
        doc.strokeColor('#dddddd').lineWidth(0.3)
          .rect(40, y, W, rowH).stroke();

        x = 40;
        doc.fillColor('#000000').font('Helvetica');
        const cells = [
          String(i + 1),
          testCases[i],
          'Pending',
          getPriority(testCases[i]),
        ];
        for (let j = 0; j < cells.length; j++) {
          doc.text(cells[j], x + 3, y + 5, { width: cols[j] - 6, lineBreak: false });
          x += cols[j];
        }
        y += rowH;

        // Page break
        if (y > 760) {
          doc.addPage();
          y = 40;
        }
      }
      y += 16;
    }

    // ── Code section ────────────────────────────────────────
    if (y > 660) { doc.addPage(); y = 40; }
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#000000').text('Исходный код теста', 40, y);
    y += 14;
    doc.font('Courier').fontSize(7).fillColor('#1a1a2e').text(code, 40, y, {
      width: W,
      lineGap: 1,
    });

    doc.end();
    stream.on('finish', () => resolve(pdfPath));
    stream.on('error', reject);
  });
}

function getPriority(name) {
  const n = name.toLowerCase();
  if (n.includes('p0') || n.includes('critical') || n.includes('smoke')) return 'P0';
  if (n.includes('p1') || n.includes('high')) return 'P1';
  if (n.includes('p2') || n.includes('medium')) return 'P2';
  if (n.includes('p3') || n.includes('low')) return 'P3';
  return 'P2';
}

module.exports = { saveTestPdf, REPORTS_DIR };
