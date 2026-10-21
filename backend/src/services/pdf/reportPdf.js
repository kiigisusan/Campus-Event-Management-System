/**
 * Renders any tabular report as a branded PDF with PDFKit.
 *
 * Every page has the CEMS logo and system name; the first page also shows the
 * report title, when and by whom it was generated, the filters used and a
 * summary; every page ends with "Page X of Y". Long tables continue on new
 * pages with the column headings repeated.
 */
import fs from 'node:fs';
import PDFDocument from 'pdfkit';
import { env } from '../../config/env.js';
import { formatEat } from '../../utils/eventTime.js';

const COLORS = {
  navy: '#1e3a5f',
  teal: '#0f766e',
  text: '#1f2937',
  muted: '#6b7280',
  rowAlt: '#f3f4f6',
  border: '#d1d5db',
};

const PAGE = { size: 'A4', layout: 'landscape', margin: 40 };
const ROW_HEIGHT = 18;
const FOOTER_SPACE = 40;

/**
 * @typedef {object} PdfColumn
 * @property {string} label
 * @property {(row: object) => unknown} value
 * @property {number} width        relative width; columns are scaled to fill the page
 * @property {'left' | 'right' | 'center'} [align]
 */

/**
 * @typedef {object} ReportPdfOptions
 * @property {string} title                       e.g. 'Attendance Report'
 * @property {string} generatedBy                 admin's name
 * @property {[string, string][]} [filters]       e.g. [['From', '2026-10-01']]
 * @property {[string, string][]} [summary]       headline numbers, e.g. [['Bookings', '120']]
 * @property {PdfColumn[]} columns
 * @property {object[]} rows
 */

/**
 * The CEMS logo. Uses REPORT_LOGO_PATH (a PNG/JPEG) if configured, otherwise
 * draws the built-in mark: a rounded tile with a calendar and a check.
 */
function drawLogo(doc, x, y, size) {
  if (env.REPORT_LOGO_PATH && fs.existsSync(env.REPORT_LOGO_PATH)) {
    doc.image(env.REPORT_LOGO_PATH, x, y, { fit: [size, size] });
    return;
  }
  const s = size / 40;
  doc.save();
  doc.roundedRect(x, y, size, size, 8 * s).fill(COLORS.navy);
  doc.roundedRect(x + 9 * s, y + 11 * s, 22 * s, 20 * s, 3 * s).fill('#ffffff');
  doc.rect(x + 9 * s, y + 11 * s, 22 * s, 6 * s).fill(COLORS.teal);
  doc.rect(x + 13 * s, y + 8 * s, 3 * s, 6 * s).fill('#ffffff');
  doc.rect(x + 24 * s, y + 8 * s, 3 * s, 6 * s).fill('#ffffff');
  doc
    .moveTo(x + 14 * s, y + 24 * s)
    .lineTo(x + 18.5 * s, y + 28 * s)
    .lineTo(x + 26 * s, y + 20 * s)
    .lineWidth(2.2 * s)
    .strokeColor(COLORS.teal)
    .stroke();
  doc.restore();
}

/** Logo + system name; returns the y position below it. */
function drawBrandHeader(doc) {
  const { left } = doc.page.margins;
  const top = doc.page.margins.top;
  drawLogo(doc, left, top, 34);
  doc
    .fillColor(COLORS.navy)
    .font('Helvetica-Bold')
    .fontSize(15)
    .text(env.APP_NAME, left + 44, top + 3, { lineBreak: false });
  doc
    .fillColor(COLORS.muted)
    .font('Helvetica')
    .fontSize(9)
    .text('CEMS', left + 44, top + 21, { lineBreak: false });
  const lineY = top + 42;
  doc
    .moveTo(left, lineY)
    .lineTo(doc.page.width - doc.page.margins.right, lineY)
    .lineWidth(1)
    .strokeColor(COLORS.border)
    .stroke();
  return lineY + 12;
}

/** "Label: value" pairs laid out on one wrapped line. */
function drawPairs(doc, pairs, y, { bold = false } = {}) {
  const { left } = doc.page.margins;
  const width = doc.page.width - left - doc.page.margins.right;
  const text = pairs.map(([label, value]) => `${label}: ${value}`).join('     ');
  doc
    .font(bold ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(9.5)
    .fillColor(COLORS.text)
    .text(text, left, y, { width });
  return doc.y + 6;
}

function scaleColumns(doc, columns) {
  const available = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const total = columns.reduce((sum, column) => sum + column.width, 0);
  return columns.map((column) => ({ ...column, px: (column.width / total) * available }));
}

/**
 * Shortens text with "..." so it fits on one line in `width` points, using
 * the current font. PDFKit's own ellipsis still wraps long words without
 * spaces (ids, JSON), which would spill into the next row.
 */
function fitText(doc, text, width) {
  if (doc.widthOfString(text) <= width) return text;
  let end = text.length;
  while (end > 0 && doc.widthOfString(`${text.slice(0, end)}...`) > width) end -= 1;
  return `${text.slice(0, end)}...`;
}

/** Draws one table cell on a single line, truncated to fit. */
function drawCell(doc, text, x, y, column) {
  const width = column.px - 8;
  doc.text(fitText(doc, text, width), x + 4, y, {
    width,
    align: column.align ?? 'left',
    lineBreak: false,
  });
}

function drawTableHeader(doc, columns, y) {
  let x = doc.page.margins.left;
  const width = columns.reduce((sum, column) => sum + column.px, 0);
  doc.rect(x, y, width, ROW_HEIGHT + 2).fill(COLORS.navy);
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#ffffff');
  for (const column of columns) {
    drawCell(doc, column.label, x, y + 6, column);
    x += column.px;
  }
  return y + ROW_HEIGHT + 2;
}

function drawRow(doc, columns, row, y, shaded) {
  let x = doc.page.margins.left;
  if (shaded) {
    const width = columns.reduce((sum, column) => sum + column.px, 0);
    doc.rect(x, y, width, ROW_HEIGHT).fill(COLORS.rowAlt);
  }
  doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.text);
  for (const column of columns) {
    const value = column.value(row);
    drawCell(doc, value === null || value === undefined ? '-' : String(value), x, y + 5, column);
    x += column.px;
  }
}

function drawFooters(doc, title) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);
    const y = doc.page.height - doc.page.margins.bottom + 10;
    const { left, right } = doc.page.margins;
    const width = doc.page.width - left - right;
    // Footer sits inside the bottom margin; stop PDFKit from adding a page for it.
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted);
    doc.text(`${env.APP_NAME} - ${title}`, left, y, { width, align: 'left', lineBreak: false });
    doc.text(`Page ${i + 1} of ${range.count}`, left, y, {
      width,
      align: 'right',
      lineBreak: false,
    });
    doc.page.margins.bottom = bottomMargin;
  }
}

/**
 * Builds the PDF and streams it into `output` (e.g. an Express response).
 * @param {NodeJS.WritableStream} output
 * @param {ReportPdfOptions} options
 */
export function writeReportPdf(
  output,
  { title, generatedBy, filters = [], summary = [], columns, rows },
) {
  const doc = new PDFDocument({
    ...PAGE,
    bufferPages: true, // needed to write "Page X of Y" once the total is known
    info: { Title: `${env.APP_NAME} - ${title}`, Author: env.APP_NAME, Subject: title },
  });
  doc.pipe(output);

  let y = drawBrandHeader(doc);
  doc.font('Helvetica-Bold').fontSize(18).fillColor(COLORS.text);
  doc.text(title, doc.page.margins.left, y);
  y = doc.y + 4;
  y = drawPairs(
    doc,
    [
      ['Generated', formatEat(new Date())],
      ['By', generatedBy],
    ],
    y,
  );
  y = drawPairs(doc, filters.length ? filters : [['Filters', 'None (all records)']], y);
  if (summary.length) y = drawPairs(doc, summary, y + 2, { bold: true });

  const scaled = scaleColumns(doc, columns);
  y = drawTableHeader(doc, scaled, y + 6);

  if (rows.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(COLORS.muted);
    doc.text('No records match these filters.', doc.page.margins.left, y + 8);
  }

  rows.forEach((row, index) => {
    if (y + ROW_HEIGHT > doc.page.height - doc.page.margins.bottom - FOOTER_SPACE) {
      doc.addPage();
      y = drawTableHeader(doc, scaled, drawBrandHeader(doc));
    }
    drawRow(doc, scaled, row, y, index % 2 === 1);
    y += ROW_HEIGHT;
  });

  drawFooters(doc, title);
  doc.end();
}
