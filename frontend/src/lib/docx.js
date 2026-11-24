// ============================================
// FILE: src/lib/docx.js
// R22 (4k, Q13): a small Word (.docx) writer with no new dependency. A .docx
// is a ZIP of three XML parts; the parts are stored (not compressed), which
// Word, LibreOffice and Google Docs all open. Text only: headings, bold,
// paragraphs and simple tables. Every string is XML-escaped.
// ponytail: stored ZIP (no deflate) makes files a few times larger than Word's; fine for lesson text.
// ============================================

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();
export const crc32 = (bytes) => {
  let c = 0xFFFFFFFF;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
};

// Stored ZIP. files: [{ name, data: Uint8Array }]
export function zipStored(files) {
  const enc = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;
  const u16 = v => [v & 0xFF, (v >>> 8) & 0xFF];
  const u32 = v => [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF];
  for (const file of files) {
    const name = enc.encode(file.name);
    const crc = crc32(file.data);
    const size = file.data.length;
    const header = [...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21),
      ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length), ...u16(0)];
    chunks.push(new Uint8Array(header), name, file.data);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21),
      ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(0), ...u32(offset)]), name);
    offset += header.length + name.length + size;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
    ...u32(centralSize), ...u32(offset), ...u16(0)]);
  const all = [...chunks, ...central, end];
  const out = new Uint8Array(all.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of all) { out.set(part, at); at += part.length; }
  return out;
}

// Characters XML 1.0 does not allow are dropped rather than written.
const xmlAllowed = (char) => {
  const n = char.codePointAt(0);
  return n === 0x09 || n === 0x0A || n === 0x0D || (n >= 0x20 && n <= 0xD7FF) || (n >= 0xE000 && n <= 0xFFFD) || n >= 0x10000;
};
export const escapeXml = value => [...String(value ?? '')].filter(xmlAllowed).join('')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const run = (text, { bold = false, size } = {}) => {
  const props = `${bold ? '<w:b/>' : ''}${size ? `<w:sz w:val="${size}"/>` : ''}`;
  return String(text ?? '').split('\n').map((line, i) => `${i ? '<w:r><w:br/></w:r>' : ''}<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ''}<w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>`).join('');
};
const SIZES = { 1: 32, 2: 28, 3: 24 };

// blocks: { heading: 1-3, text } | { text, bold } | { table: [[cell, ...], ...] }
export function documentXml(blocks) {
  const body = blocks.map(block => {
    if (block.table) {
      const rows = block.table.map(row => `<w:tr>${row.map(cell => `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/></w:tcPr><w:p>${run(cell)}</w:p></w:tc>`).join('')}</w:tr>`).join('');
      const border = '<w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/>';
      return `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>${border}</w:tblBorders></w:tblPr>${rows}</w:tbl><w:p/>`;
    }
    if (block.heading) return `<w:p>${run(block.text, { bold: true, size: SIZES[block.heading] || 24 })}</w:p>`;
    return `<w:p>${run(block.text, { bold: block.bold })}</w:p>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr></w:body></w:document>`;
}

const CONTENT_TYPES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
const RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';

export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function buildDocx(blocks) {
  const enc = new TextEncoder();
  return zipStored([
    { name: '[Content_Types].xml', data: enc.encode(CONTENT_TYPES) },
    { name: '_rels/.rels', data: enc.encode(RELS) },
    { name: 'word/document.xml', data: enc.encode(documentXml(blocks)) },
  ]);
}

// A safe file name: letters, digits, spaces, dot, dash and underscore only.
export const docxFileName = (title, suffix = '') => `${String(title || 'EduScribe').replace(/[^\p{L}\p{N} ._-]+/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'EduScribe'}${suffix}.docx`;

export function downloadDocx(blocks, fileName, { doc = globalThis.document, url = globalThis.URL } = {}) {
  const blob = new Blob([buildDocx(blocks)], { type: DOCX_MIME });
  const href = url.createObjectURL(blob);
  const link = doc.createElement('a');
  link.href = href;
  link.download = fileName;
  doc.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => url.revokeObjectURL(href), 0);
}
