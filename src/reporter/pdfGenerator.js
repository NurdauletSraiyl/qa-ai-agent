'use strict';

const PDFDocument = require('pdfkit');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');

async function generatePdf(title, content) {
  const tmpFile = path.join(os.tmpdir(), `qa-${Date.now()}.pdf`);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const stream = fs.createWriteStream(tmpFile);

    doc.pipe(stream);

    // Title
    doc.fontSize(16).font('Helvetica-Bold').text(title, { align: 'left' });
    doc.moveDown(0.5);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();
    doc.moveDown(0.8);

    // Body — monospace for code, regular for text
    const isCode = content.includes('import {') || content.includes('test(') || content.includes('expect(');
    doc.fontSize(9).font(isCode ? 'Courier' : 'Helvetica').text(content, {
      align: 'left',
      lineGap: 2,
    });

    doc.end();
    stream.on('finish', () => resolve(tmpFile));
    stream.on('error', reject);
  });
}

module.exports = { generatePdf };
