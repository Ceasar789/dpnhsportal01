import { sanitizeLessonPlanHtml, escapeLessonPlanTitle } from '../lessonPlanHtml';
import { ilawBrandAssets } from './ilawBrandAssets';

// This document is deliberately independent of the dashboard theme and of the
// editable HTML. Branding is added only to the temporary print DOM.
const printStyles = `
  @page { size: A4 portrait; margin: 12mm; }
  html, body { margin: 0; padding: 0; background: #fff; color: #172b40; }
  body { font: 10pt/1.45 Arial, sans-serif; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  .ilaw-print-brand { display: grid; grid-template-columns: 18mm minmax(0, 1fr) 29mm; align-items: center; gap: 2mm; min-height: 18mm; margin-bottom: 4mm; text-align: center; break-inside: avoid; }
  .ilaw-print-brand > img { width: 18mm; height: 18mm; object-fit: contain; }
  .ilaw-print-brand-right { display: flex; width: 29mm; align-items: center; }
  .ilaw-print-brand-right img { width: 50%; height: 15mm; object-fit: contain; }
  .ilaw-print-brand-text p { margin: 0; font-size: 8pt; line-height: 1.25; }
  .ilaw-print-brand-text .ilaw-school-name { font-weight: 700; text-transform: uppercase; }
  .ilaw-lesson-plan, .ilaw-section, .ilaw-field { min-width: 0; max-width: 100%; }
  .ilaw-title { margin: 3mm 0 4mm; text-align: center; font-size: 13pt; font-weight: 700; break-after: avoid; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 2mm 0 4mm; }
  th, td { border: 0.4pt solid #68839a; padding: 1.5mm; text-align: left; vertical-align: top; overflow-wrap: anywhere; word-break: normal; }
  th { background: #dcecf8; color: #172b40; font-weight: 700; }
  .ilaw-info-table th { width: 23%; }
  .ilaw-week-table th, .ilaw-week-table td { width: 20%; }
  thead { display: table-header-group; }
  .ilaw-info-table tr { break-inside: avoid; page-break-inside: avoid; }
  .ilaw-section { margin: 0 0 4mm; border: 0.4pt solid #68839a; }
  .ilaw-section-header { padding: 2mm 3mm; background: #c8e1f4; color: #173653; font-weight: 700; break-after: avoid; }
  .ilaw-section-intro { padding: 2mm 3mm; border-bottom: 0.4pt solid #a8c2d6; color: #365066; font-style: italic; }
  .ilaw-field { padding: 2mm 3mm; border-bottom: 0.4pt solid #a8c2d6; }
  .ilaw-field:last-child { border-bottom: 0; }
  .ilaw-label { display: block; font-weight: 700; text-transform: uppercase; }
  .ilaw-label-hint { display: block; color: #365066; font-size: 9pt; font-style: italic; }
  p, li, blockquote { overflow-wrap: anywhere; }
  .ilaw-field p, .ilaw-field ul, .ilaw-field ol { margin: 1mm 0; }
  .ilaw-signatures { margin-top: 5mm; break-inside: avoid; }
  .ilaw-sig-row { display: flex; justify-content: space-between; gap: 8mm; }
  .ilaw-sig-col { width: 48%; }
  .ilaw-sig-name { display: inline-block; margin: 5mm 0 0; border-top: 0.4pt solid #172b40; font-weight: 700; }
  .ilaw-sig-tag, .ilaw-sig-position { display: block; font-style: italic; }
`;

const addBranding = (doc, sourceHasSchoolName, assets) => {
  const letterhead = doc.querySelector('.ilaw-letterhead');
  const brand = doc.createElement('header');
  brand.className = 'ilaw-print-brand';

  const image = (src, alt) => {
    const element = doc.createElement('img');
    element.src = src;
    element.alt = alt;
    return element;
  };
  brand.append(image(assets.depedLogo, 'Department of Education logo'));

  const text = doc.createElement('div');
  text.className = 'ilaw-print-brand-text';
  if (letterhead) {
    while (letterhead.firstChild) text.append(letterhead.firstChild);
  } else if (!sourceHasSchoolName) {
    ['Republic of the Philippines', 'Department of Education', 'Region IVA-CALABARZON',
      'City Schools Division of Biñan City', 'DELA PAZ NATIONAL HIGH SCHOOL',
      'P. Paterno St., Dela Paz, Biñan City, Laguna'].forEach((line, index) => {
      const paragraph = doc.createElement('p');
      if (index === 4) paragraph.className = 'ilaw-school-name';
      paragraph.textContent = line;
      text.append(paragraph);
    });
  }
  brand.append(text);

  const right = doc.createElement('div');
  right.className = 'ilaw-print-brand-right';
  right.append(
    image(assets.schoolSeal, 'Dela Paz National High School seal'),
    image(assets.eduscribeLogo, 'EduScribe logo'),
  );
  brand.append(right);
  if (letterhead) letterhead.replaceWith(brand);
  else doc.body.prepend(brand);
  return brand;
};

const localAssetAsDataUrl = async src => {
  const response = await fetch(new URL(src, window.location.href));
  if (!response.ok) throw new Error('A lesson plan logo could not be loaded. Please try printing again.');
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('A lesson plan logo could not be loaded. Please try printing again.'));
    reader.readAsDataURL(blob);
  });
};

const repeatWeekdayHeadings = doc => {
  doc.querySelectorAll('.ilaw-week-table').forEach(table => {
    const row = table.querySelector('tr');
    if (!row || ![...row.children].every(cell => cell.tagName === 'TH')) return;
    const head = doc.createElement('thead');
    head.append(row);
    table.prepend(head);
  });
};

export const openLessonPlanPrint = async ({ html, filename, aiGenerated }) => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) throw new Error('Print popup was blocked. Allow popups for this site and try again.');

  const safeHtml = sanitizeLessonPlanHtml(html);
  const sourceHasSchoolName = /dela paz national high school/i.test(
    new DOMParser().parseFromString(safeHtml, 'text/html').body.textContent,
  );
  printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeLessonPlanTitle(filename)}</title><style>${printStyles}</style></head><body>${safeHtml}</body></html>`);
  printWindow.document.close();
  printWindow.document.title = filename;
  repeatWeekdayHeadings(printWindow.document);
  try {
    if (aiGenerated) {
      const [depedLogo, schoolSeal, eduscribeLogo] = await Promise.all([
        ilawBrandAssets.depedLogo, ilawBrandAssets.schoolSeal, ilawBrandAssets.eduscribeLogo,
      ].map(localAssetAsDataUrl));
      addBranding(printWindow.document, sourceHasSchoolName, { depedLogo, schoolSeal, eduscribeLogo });
      await Promise.all([...printWindow.document.images].map(img => img.decode()));
    }
    await printWindow.document.fonts?.ready;
    printWindow.focus();
    const originalAppTitle = document.title;
    try {
      // Chrome may derive the Save-as-PDF suggestion from either browsing
      // context. The native dialog still controls the final filename.
      document.title = filename;
      printWindow.print();
    } finally {
      document.title = originalAppTitle;
    }
  } catch (error) {
    printWindow.close();
    throw error;
  }
};
