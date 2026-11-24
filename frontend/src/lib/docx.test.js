// R22 (4k): the .docx writer makes a valid stored ZIP with the three Word parts, and escapes text.
import { describe, expect, it } from 'vitest';
import { buildDocx, crc32, docxFileName, documentXml, escapeXml } from './docx';
import { blocksHtml, printBlocks } from './printBlocks';

// Minimal reader for stored ZIPs: walks the local headers.
const readZip = (bytes) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = {};
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    const method = view.getUint16(at + 8, true);
    const crc = view.getUint32(at + 14, true);
    const size = view.getUint32(at + 18, true);
    const nameLength = view.getUint16(at + 26, true);
    const name = new TextDecoder().decode(bytes.slice(at + 30, at + 30 + nameLength));
    const data = bytes.slice(at + 30 + nameLength, at + 30 + nameLength + size);
    files[name] = { method, crc, data, text: new TextDecoder().decode(data) };
    at += 30 + nameLength + size;
  }
  return { files, endFound: view.getUint32(bytes.length - 22, true) === 0x06054b50 };
};

describe('docx writer', () => {
  it('crc32 matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xCBF43926);
  });
  it('is a stored ZIP with content types, relationships and the document, each with a correct CRC', () => {
    const { files, endFound } = readZip(buildDocx([{ heading: 1, text: 'Cells' }, { text: 'Line one' }]));
    expect(Object.keys(files)).toEqual(['[Content_Types].xml', '_rels/.rels', 'word/document.xml']);
    expect(endFound).toBe(true);
    for (const file of Object.values(files)) {
      expect(file.method).toBe(0);
      expect(file.crc).toBe(crc32(file.data));
    }
    expect(files['word/document.xml'].text).toContain('<w:t xml:space="preserve">Cells</w:t>');
    expect(files['[Content_Types].xml'].text).toContain('wordprocessingml.document.main+xml');
  });
  it('escapes markup and drops characters XML cannot hold', () => {
    expect(escapeXml('<b>A & "B"</b>\u0001')).toBe('&lt;b&gt;A &amp; &quot;B&quot;&lt;/b&gt;');
    const xml = documentXml([{ text: '<script>alert(1)</script>' }, { table: [['x < y', 'ñ']] }]);
    expect(xml).not.toContain('<script>');
    expect(xml).toContain('x &lt; y');
    expect(xml).toContain('<w:tbl>');
  });
  it('a line break inside a paragraph becomes a Word break', () => {
    expect(documentXml([{ text: 'a\nb' }])).toContain('<w:r><w:br/></w:r>');
  });
  it('file names are safe', () => {
    expect(docxFileName('Matter: <Week 1>/2', ' - Key')).toBe('Matter Week 1 2 - Key.docx');
    expect(docxFileName('')).toBe('EduScribe.docx');
  });
});

describe('print page (PDF through the browser)', () => {
  it('escapes every string and keeps tables', () => {
    const html = blocksHtml([{ heading: 1, text: '<img src=x onerror=alert(1)>' }, { table: [['a & b']] }], 'T<');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('<td>a &amp; b</td>');
    expect(html).toContain('<title>T&lt;</title>');
  });
  it('writes the page and prints; a blocked window is reported', () => {
    const doc = { open() {}, write(text) { doc.text = text; }, close() {} };
    let printed = false;
    expect(printBlocks([{ text: 'x' }], 'T', () => ({ document: doc, focus() {}, print() { printed = true; } }))).toBe(true);
    expect(printed).toBe(true);
    expect(doc.text).toContain('<p>x</p>');
    expect(printBlocks([{ text: 'x' }], 'T', () => null)).toBe(false);
  });
});
