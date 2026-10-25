import { ilawBrandAssets } from './ilawBrandAssets';
import { buildManualIlawPdfDefinition } from './manualIlawPdf';
import { resolveLessonPlanDownloadFilename } from '../lessonPlanFilename';

async function embeddedLogo(asset) {
  try {
    const image = new Image();
    image.src = asset;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('Empty logo');
    const canvas = window.document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext('2d').drawImage(image, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    throw new Error('A school logo could not be loaded for the PDF.');
  }
}

// Only bundled local assets and current structured Manual ILAW data enter this path.
export async function downloadManualIlawPdf({ document, sourceDetails, filename }) {
  const [depedLogo, schoolSeal, eduscribeLogo] = await Promise.all([
    embeddedLogo(ilawBrandAssets.depedLogo),
    embeddedLogo(ilawBrandAssets.schoolSeal),
    embeddedLogo(ilawBrandAssets.eduscribeLogo),
  ]);
  const definition = buildManualIlawPdfDefinition({ document, sourceDetails },
    { depedLogo, schoolSeal, eduscribeLogo });
  const [{ default: pdfMake }, { default: pdfFonts }] = await Promise.all([
    import('pdfmake/build/pdfmake.js'), import('pdfmake/build/vfs_fonts.js'),
  ]);
  pdfMake.addVirtualFileSystem(pdfFonts);
  const blob = await pdfMake.createPdf(definition).getBlob();
  if (!(blob instanceof Blob) || blob.size < 100 ||
    new TextDecoder().decode(await blob.slice(0, 5).arrayBuffer()) !== '%PDF-') {
    throw new Error('The PDF could not be generated. Please try again.');
  }

  const safeFilename = resolveLessonPlanDownloadFilename(filename, document.info.nameOfLesson);
  const url = URL.createObjectURL(blob);
  try {
    const link = window.document.createElement('a');
    link.href = url;
    link.download = safeFilename;
    link.style.display = 'none';
    window.document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    // Keep the blob alive while the browser hands the download to its manager.
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
  return safeFilename;
}
