// 4j (QA ID-088 / ID-185): a lesson plan's source PDF is opened through a
// short-lived signed link made for the signed-in teacher, never through the
// stored public link. Once the proposed migration (autorun/sql/4j) makes the
// `lesson-pdfs` bucket private, only the owner's signed link works.
// Until then the stored link is the fallback, so nothing breaks today.
export const SOURCE_PDF_BUCKET = 'lesson-pdfs';
export const SOURCE_PDF_LINK_SECONDS = 300;

export async function sourcePdfUrl(plan, client) {
  const path = typeof plan?.file_path === 'string' ? plan.file_path.trim() : '';
  if (path) {
    try {
      const { data, error } = await client.storage.from(SOURCE_PDF_BUCKET).createSignedUrl(path, SOURCE_PDF_LINK_SECONDS);
      if (!error && data?.signedUrl) return data.signedUrl;
    } catch {
      // fall through to the stored link
    }
  }
  return plan?.file_url || null;
}

// Opens the tab first (inside the click, so no popup blocker), then points it
// at the link once it is ready. Returns false when there is no link at all.
export async function openSourcePdf(plan, client, openWindow = (...args) => window.open(...args)) {
  const tab = openWindow('about:blank', '_blank');
  const url = await sourcePdfUrl(plan, client);
  if (!url) { tab?.close?.(); return false; }
  if (tab) { tab.opener = null; tab.location.href = url; } else openWindow(url, '_blank', 'noopener,noreferrer');
  return true;
}
