// R22 (4k): the same blocks lib/docx.js writes, opened as a print page so the
// browser's "Save as PDF" makes the PDF. Every string is HTML-escaped; no
// script runs in the page except the one print() call.
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function blocksHtml(blocks, title) {
  const body = blocks.map(block => {
    if (block.table) return `<table>${block.table.map(row => `<tr>${row.map(cell => `<td>${esc(cell).replace(/\n/g, '<br>')}</td>`).join('')}</tr>`).join('')}</table>`;
    if (block.heading) return `<h${block.heading}>${esc(block.text)}</h${block.heading}>`;
    return `<p${block.bold ? ' class="b"' : ''}>${esc(block.text).replace(/\n/g, '<br>')}</p>`;
  }).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>`
    + 'body{font:12pt/1.45 Arial,sans-serif;color:#111;margin:18mm}h1{font-size:18pt}h2{font-size:15pt}h3{font-size:13pt}'
    + 'p{margin:0 0 6pt;white-space:pre-wrap}.b{font-weight:700}table{border-collapse:collapse;width:100%;margin:6pt 0}'
    + 'td{border:1px solid #555;padding:4pt;vertical-align:top}@page{size:A4;margin:12mm}</style></head>'
    + `<body>${body}</body></html>`;
}

// Opens inside the click (no popup blocker); returns false when the browser refused the window.
export function printBlocks(blocks, title, openWindow = (...args) => window.open(...args)) {
  const tab = openWindow('', '_blank');
  if (!tab) return false;
  tab.document.open();
  tab.document.write(blocksHtml(blocks, title));
  tab.document.close();
  tab.focus();
  tab.print();
  return true;
}
