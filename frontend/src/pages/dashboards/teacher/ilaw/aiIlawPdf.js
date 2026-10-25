import { sanitizeLessonPlanHtml } from '../lessonPlanHtml';
import { ILAW_SCHOOL_LETTERHEAD } from './ilawDocumentContent';

// This is a deliberately narrow renderer, not a general HTML-to-PDF converter.
// Saved AI HTML may be edited by a Teacher, so unsupported markup fails closed.
const TAGS = new Set([
  'A', 'B', 'BLOCKQUOTE', 'BR', 'COL', 'COLGROUP', 'DIV', 'EM', 'H1', 'H2',
  'H3', 'H4', 'H5', 'H6', 'HR', 'I', 'LI', 'OL', 'P', 'SPAN', 'STRONG',
  'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'U', 'UL',
]);
const INLINE = new Set(['A', 'B', 'BR', 'EM', 'I', 'SPAN', 'STRONG', 'U']);
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const BORDER = '#68839a';
const unsupported = detail => new Error(`PDF download is unavailable: ${detail}. Use Print for this plan.`);

function validateOriginal(html) {
  if (typeof html !== 'string' || !html.trim()) throw unsupported('the saved lesson plan is empty');
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  for (const element of parsed.querySelectorAll('*')) {
    if (['HTML', 'HEAD', 'BODY'].includes(element.tagName)) continue;
    if (!TAGS.has(element.tagName)) throw unsupported(`<${element.tagName.toLowerCase()}> content cannot be represented safely`);
    for (const attribute of element.attributes) {
      if (!['class', 'colspan', 'rowspan', 'href', 'title'].includes(attribute.name)) {
        throw unsupported(`the ${attribute.name} HTML attribute is not supported`);
      }
    }
    if (element.tagName === 'A' && element.hasAttribute('href') &&
      !/^(https?:\/\/|mailto:)/i.test(element.getAttribute('href'))) {
      throw unsupported('an unsafe or relative link was found');
    }
  }
  return parsed;
}

function markedText(node, seen) {
  seen.add(node);
  // pdfmake cannot always wrap a long uninterrupted token inside a weekday cell.
  // Soft break opportunities affect layout only; the saved HTML is untouched.
  return node.nodeValue.replace(/\s+/gu, ' ').replace(/\S{35,}/gu, word =>
    Array.from(word).reduce((text, character, index) =>
      text + (index && index % 28 === 0 ? '\u200b' : '') + character, ''));
}

function richRuns(node, seen, style = {}) {
  if (node.nodeType === Node.TEXT_NODE) {
    return [{ text: markedText(node, seen), ...style }];
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return [];
  if (node.tagName === 'BR') return [{ text: '\n', ...style }];
  if (['TABLE', 'UL', 'OL'].includes(node.tagName)) throw unsupported('a nested table or list cannot be represented');
  const next = { ...style };
  if (['B', 'STRONG'].includes(node.tagName) || node.classList.contains('ilaw-label') || node.classList.contains('ilaw-sig-name')) next.bold = true;
  if (['EM', 'I'].includes(node.tagName) || node.classList.contains('ilaw-label-hint') || node.classList.contains('ilaw-sig-position')) next.italics = true;
  if (node.tagName === 'U') next.decoration = 'underline';
  if (node.tagName === 'A' && node.hasAttribute('href')) next.link = node.getAttribute('href');
  const runs = [];
  for (const child of node.childNodes) {
    if (child.nodeType === Node.ELEMENT_NODE && ['P', 'DIV'].includes(child.tagName) && runs.length) runs.push({ text: '\n', ...next });
    runs.push(...richRuns(child, seen, next));
    if (child.nodeType === Node.ELEMENT_NODE && ['P', 'DIV'].includes(child.tagName)) runs.push({ text: '\n', ...next });
  }
  return runs;
}

function cellContent(cell, seen) {
  const runs = [];
  for (const child of cell.childNodes) runs.push(...richRuns(child, seen));
  return { text: runs.length ? runs : ' ', fontSize: 8, margin: [2, 1, 2, 1],
    bold: cell.tagName === 'TH', fillColor: cell.tagName === 'TH' ? '#dcecf8' : undefined };
}

function tableBlock(table, seen) {
  const rowNodes = [...table.querySelectorAll('tr')];
  if (!rowNodes.length || rowNodes.some(row => row.closest('table') !== table)) throw unsupported('the table has no valid rows');
  const body = [];
  let columns = 0;
  for (let rowIndex = 0; rowIndex < rowNodes.length; rowIndex += 1) {
    const row = rowNodes[rowIndex];
    const output = [];
    let column = 0;
    for (const cell of row.children) {
      if (!['TD', 'TH'].includes(cell.tagName)) throw unsupported('a table row contains unsupported content');
      while (output[column] !== undefined) column += 1;
      const colSpan = Number(cell.getAttribute('colspan') || 1);
      const rowSpan = Number(cell.getAttribute('rowspan') || 1);
      if (rowSpan !== 1) throw unsupported('row-spanning table cells are not supported');
      if (!Number.isInteger(colSpan) || colSpan < 1 || colSpan > 6) {
        throw unsupported('a table has an invalid merged cell');
      }
      const content = cellContent(cell, seen);
      output[column] = { ...content, ...(colSpan > 1 ? { colSpan } : {}) };
      for (let offset = 1; offset < colSpan; offset += 1) output[column + offset] = {};
      column += colSpan;
    }
    columns = Math.max(columns, output.length);
    body.push(output);
  }
  if (columns > 6 || columns < 1) throw unsupported('the table dimensions are unsupported');
  for (const row of body) {
    if (row.length !== columns || row.some(cell => cell === undefined)) throw unsupported('the table has uneven rows');
  }
  if (table.classList.contains('ilaw-week-table')) {
    const first = rowNodes[0];
    if (columns !== 5 || first.children.length !== 5 ||
      [...first.children].some((cell, index) => cell.tagName !== 'TH' || cell.textContent.trim() !== WEEKDAYS[index])) {
      throw unsupported('the Monday–Friday table is incomplete');
    }
  }
  for (const element of table.querySelectorAll('colgroup, col')) {
    if (element.textContent.trim()) throw unsupported('table column metadata contains content');
  }
  return { table: { headerRows: rowNodes[0].children[0]?.tagName === 'TH' ? 1 : 0,
    widths: Array(columns).fill('*'), body },
  layout: { hLineColor: () => BORDER, vLineColor: () => BORDER,
    hLineWidth: () => 0.5, vLineWidth: () => 0.5,
    paddingLeft: () => 2, paddingRight: () => 2,
    paddingTop: () => 1.5, paddingBottom: () => 1.5 },
  margin: [0, 2, 0, 7], fontSize: 8 };
}

function blocksFrom(parent, seen, letterhead) {
  const blocks = [];
  let inline = [];
  const flush = () => {
    if (inline.length) blocks.push({ text: inline, fontSize: 9, margin: [0, 1, 0, 3] });
    inline = [];
  };
  for (const node of parent.childNodes) {
    if (node === letterhead) continue;
    if (node.nodeType === Node.TEXT_NODE) {
      const value = markedText(node, seen);
      if (value.trim()) inline.push({ text: value });
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const tag = node.tagName;
    if (tag === 'TABLE') {
      flush(); blocks.push(tableBlock(node, seen));
    } else if (['UL', 'OL'].includes(tag)) {
      flush();
      const items = [...node.children];
      if (items.some(item => item.tagName !== 'LI')) throw unsupported('a list contains unsupported items');
      items.forEach((item, index) => {
        const runs = richRuns(item, seen);
        blocks.push({ text: [{ text: tag === 'OL' ? `${index + 1}. ` : '• ' }, ...runs], fontSize: 9, margin: [8, 0, 0, 2] });
      });
    } else if (/^H[1-6]$/.test(tag) || tag === 'P' || tag === 'BLOCKQUOTE' || tag === 'HR' ||
      node.classList.contains('ilaw-section-header') || node.classList.contains('ilaw-section-intro') ||
      node.classList.contains('ilaw-label') || node.classList.contains('ilaw-label-hint') ||
      node.classList.contains('ilaw-sig-tag') || node.classList.contains('ilaw-sig-name') || node.classList.contains('ilaw-sig-position')) {
      flush();
      if (tag === 'HR') blocks.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 760, y2: 0, lineWidth: 0.5, lineColor: BORDER }], margin: [0, 4, 0, 5] });
      else {
        const heading = /^H[1-6]$/.test(tag) || node.classList.contains('ilaw-section-header');
        const label = node.classList.contains('ilaw-label') || node.classList.contains('ilaw-sig-name');
        blocks.push({ text: richRuns(node, seen), fontSize: tag === 'H1' || node.classList.contains('ilaw-title') ? 12 : heading ? 10 : 9,
          bold: heading || label, italics: node.classList.contains('ilaw-section-intro') || node.classList.contains('ilaw-label-hint'),
          alignment: node.classList.contains('ilaw-title') ? 'center' : undefined,
          margin: heading ? [0, 5, 0, 3] : [0, 1, 0, 3] });
      }
    } else if (INLINE.has(tag)) {
      inline.push(...richRuns(node, seen));
    } else if (tag === 'DIV' || tag === 'LI') {
      flush(); blocks.push(...blocksFrom(node, seen, letterhead));
    } else if (tag === 'COL' || tag === 'COLGROUP' || tag === 'TBODY' || tag === 'THEAD' || tag === 'TFOOT' || tag === 'TR' || tag === 'TD' || tag === 'TH') {
      throw unsupported('table markup appears outside a table');
    } else throw unsupported(`<${tag.toLowerCase()}> content cannot be represented`);
  }
  flush();
  return blocks;
}

export function parseAiIlawHtml(html) {
  const original = validateOriginal(html);
  const safe = sanitizeLessonPlanHtml(html);
  const body = new DOMParser().parseFromString(safe, 'text/html').body;
  const normalizedText = value => value.replace(/\s+/gu, ' ').trim();
  if (normalizedText(original.body.textContent) !== normalizedText(body.textContent)) {
    throw unsupported('sanitization would remove saved lesson-plan text');
  }
  const letterheads = body.querySelectorAll('.ilaw-letterhead');
  if (letterheads.length > 1) throw unsupported('multiple school letterheads were found');
  const letterhead = letterheads[0] || null;
  const seen = new Set();
  const letterheadLines = letterhead ? blocksFrom(letterhead, seen, null).map(block => block.text) : null;
  const content = blocksFrom(body, seen, letterhead);
  const remaining = [...body.querySelectorAll('*')].flatMap(element => [...element.childNodes])
    .concat([...body.childNodes]).filter(node => node.nodeType === Node.TEXT_NODE && node.nodeValue.trim() && !seen.has(node));
  if (remaining.length) throw unsupported('some saved text could not be represented');
  if (!content.length) throw unsupported('the saved lesson plan has no printable content');
  const sourceHasSchoolName = /dela paz national high school/i.test(body.textContent);
  return { content, letterheadLines: letterheadLines || (sourceHasSchoolName ? [] : ILAW_SCHOOL_LETTERHEAD),
    sourceHasSchoolName };
}

export function buildAiIlawPdfDefinition(parsed, logos, title) {
  if (!['depedLogo', 'schoolSeal', 'eduscribeLogo'].every(key =>
    /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(logos?.[key] ?? ''))) {
    throw new Error('The approved school logos could not be embedded in the PDF.');
  }
  return { pageSize: 'A4', pageOrientation: 'landscape', pageMargins: [34, 32, 34, 32],
    info: { title: String(title || 'ILAW Lesson Plan') }, defaultStyle: { font: 'Roboto', color: '#172b40', fontSize: 9 },
    content: [{ columns: [
      { image: logos.depedLogo, fit: [55, 55], width: 60 },
      { stack: parsed.letterheadLines.map(line => ({ text: line, alignment: 'center', fontSize: 8,
        bold: JSON.stringify(line).toLowerCase().includes('dela paz national high school') })), width: '*' },
      { columns: [{ image: logos.schoolSeal, fit: [44, 53], width: 45 },
        { image: logos.eduscribeLogo, fit: [44, 53], width: 45 }], width: 90 },
    ], margin: [0, 0, 0, 8], unbreakable: true }, ...parsed.content] };
}
