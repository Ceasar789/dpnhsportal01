import { inflateSync } from 'node:zlib';

// Narrow test reader for this repository's pdfmake 0.3 output. It reads PDF
// ToUnicode maps and page content streams; it is not an application PDF parser.
export function inspectPdfmakePdf(bytes) {
  const pdf = Buffer.from(bytes).toString('latin1');
  const objects = new Map();
  for (const match of pdf.matchAll(/(?:^|\n)(\d+) 0 obj\s*([\s\S]*?)\nendobj/g)) {
    objects.set(Number(match[1]), match[2]);
  }
  const object = id => objects.get(Number(id)) || '';
  const stream = id => {
    const value = object(id);
    const match = /stream\r?\n([\s\S]*?)\r?\nendstream/.exec(value);
    if (!match) throw new Error(`PDF object ${id} has no stream`);
    const raw = Buffer.from(match[1], 'latin1');
    return value.includes('/FlateDecode') ? inflateSync(raw).toString('latin1') : match[1];
  };
  const unicode = hex => Buffer.from(hex, 'hex').swap16().toString('utf16le');
  const cmap = id => {
    const map = new Map();
    const content = stream(id);
    for (const range of content.matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>\s*\[([^\]]+)\]/gi)) {
      const start = parseInt(range[1], 16);
      const values = [...range[3].matchAll(/<([0-9a-f\s]+)>/gi)];
      values.forEach((value, offset) => map.set(start + offset, unicode(value[1].replace(/\s+/g, ''))));
    }
    for (const item of content.matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>/gi)) {
      const key = parseInt(item[1], 16);
      if (!map.has(key)) map.set(key, unicode(item[2]));
    }
    return map;
  };
  const pages = [...objects.entries()].filter(([, value]) => /\/Type\s*\/Page\b/.test(value));
  const imageCount = [...objects.values()].filter(value => /\/Subtype\s*\/Image\b/.test(value)).length;
  const pageTexts = pages.map(([, page]) => {
    const resources = object(/\/Resources\s+(\d+) 0 R/.exec(page)?.[1]);
    const fontMaps = new Map();
    for (const font of resources.matchAll(/\/(F\d+)\s+(\d+) 0 R/g)) {
      const unicodeId = /\/ToUnicode\s+(\d+) 0 R/.exec(object(font[2]))?.[1];
      if (unicodeId) fontMaps.set(font[1], cmap(unicodeId));
    }
    const pageStream = stream(/\/Contents\s+(\d+) 0 R/.exec(page)?.[1]);
    const fragments = [];
    for (const textBlock of pageStream.matchAll(/BT([\s\S]*?)ET/g)) {
      const font = /\/(F\d+)\s+\d+(?:\.\d+)?\s+Tf/.exec(textBlock[1])?.[1];
      const map = fontMaps.get(font);
      if (!map) continue;
      for (const hex of textBlock[1].matchAll(/<([0-9a-f]+)>/gi)) {
        const codes = hex[1].match(/.{4}/g) || [];
        fragments.push(codes.map(code => map.get(parseInt(code, 16)) ?? '').join(''));
      }
    }
    return fragments.join(' ');
  });
  return { pageCount: pages.length, imageCount, pageTexts };
}
