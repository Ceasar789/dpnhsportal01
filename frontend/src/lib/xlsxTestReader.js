// Test helper (U-T6): opens an .xlsx made by lib/xlsx.js the way a reader does:
// walks the stored ZIP, checks each CRC, parses the XML and reads the cells.
// Used only by tests; needs a DOMParser (jsdom).
import { crc32 } from './docx';

// A reader for stored (uncompressed) ZIPs: name -> text.
export function unzip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dec = new TextDecoder();
  const files = {};
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    const method = view.getUint16(at + 8, true);
    const crc = view.getUint32(at + 14, true);
    const size = view.getUint32(at + 18, true);
    const nameLen = view.getUint16(at + 26, true);
    const extra = view.getUint16(at + 28, true);
    const name = dec.decode(bytes.subarray(at + 30, at + 30 + nameLen));
    const data = bytes.subarray(at + 30 + nameLen + extra, at + 30 + nameLen + extra + size);
    if (method !== 0) throw new Error('not stored');
    if (crc32(data) !== crc) throw new Error(`bad crc ${name}`);
    files[name] = dec.decode(data);
    at += 30 + nameLen + extra + size;
  }
  return files;
}
export const xml = text => new DOMParser().parseFromString(text, 'application/xml');
export function readCells(bytes) {
  const doc = xml(unzip(bytes)['xl/worksheets/sheet1.xml']);
  const cells = {};
  for (const c of doc.getElementsByTagName('c')) {
    const t = c.getAttribute('t');
    const v = t === 'inlineStr' ? c.getElementsByTagName('t')[0]?.textContent ?? '' : c.getElementsByTagName('v')[0]?.textContent;
    cells[c.getAttribute('r')] = { v: t === 'inlineStr' ? v : v === undefined ? undefined : Number(v), s: Number(c.getAttribute('s') || 0) };
  }
  return { cells, doc };
}

