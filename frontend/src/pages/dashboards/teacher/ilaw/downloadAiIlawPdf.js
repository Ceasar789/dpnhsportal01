import { ilawBrandAssets } from './ilawBrandAssets';
import { buildAiIlawPdfDefinition, parseAiIlawHtml } from './aiIlawPdf';
import { resolveLessonPlanDownloadFilename } from '../lessonPlanFilename';

async function embeddedLogo(asset) {
  try {
    const image = new Image();
    image.src = asset;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('Empty logo');
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext('2d').drawImage(image, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    throw new Error('A school logo could not be loaded for the PDF.');
  }
}

// Export only the saved row supplied by the authenticated Teacher's existing list.
// No editor DOM, source PDF, external service, or database mutation enters this path.
export async function downloadAiIlawPdf({ html, title, filename, isCurrentTeacher = () => true }) {
  const parsed = parseAiIlawHtml(html);
  const [depedLogo, schoolSeal, eduscribeLogo] = await Promise.all([
    embeddedLogo(ilawBrandAssets.depedLogo),
    embeddedLogo(ilawBrandAssets.schoolSeal),
    embeddedLogo(ilawBrandAssets.eduscribeLogo),
  ]);
  const definition = buildAiIlawPdfDefinition(parsed, { depedLogo, schoolSeal, eduscribeLogo }, title);
  const [{ default: pdfMake }, { default: pdfFonts }] = await Promise.all([
    import('pdfmake/build/pdfmake.js'), import('pdfmake/build/vfs_fonts.js'),
  ]);
  pdfMake.addVirtualFileSystem(pdfFonts);
  const blob = await pdfMake.createPdf(definition).getBlob();
  if (!(blob instanceof Blob) || blob.size < 100 ||
    new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer()) !== '%PDF-') {
    throw new Error('The PDF could not be generated. Please try again.');
  }
  const safeFilename = resolveLessonPlanDownloadFilename(filename, title);
  if (!isCurrentTeacher()) throw new Error('The signed-in Teacher changed. Reopen the lesson plan before downloading.');
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = safeFilename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  return safeFilename;
}
