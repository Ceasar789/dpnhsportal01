const FALLBACK_STEM = 'ILAW_Lesson_Plan';
const RESERVED_WINDOWS_NAME = /^(?:con|prn|aux|nul|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])(?:\..*)?$/i;

const safeStem = value => {
  let stem = [...String(value ?? '').replace(/[\t\n\r\f\v]/g, ' ')]
    .filter(character => character.charCodeAt(0) > 31 && character.charCodeAt(0) !== 127)
    .join('')
    .replace(/[<>:"/\\|?*]/g, '_')
    .trim()
    .replace(/[. ]+$/g, '');
  while (/\.(?:doc|docx|pdf)$/i.test(stem)) stem = stem.replace(/\.(?:doc|docx|pdf)$/i, '');
  stem = stem.replace(/^\.+|\.+$/g, '').replace(/\s+/g, ' ').replace(/_+/g, '_').replace(/^[_ ]+|[_ ]+$/g, '').slice(0, 120).replace(/[. ]+$/g, '');
  if (RESERVED_WINDOWS_NAME.test(stem)) stem = `ILAW_${stem}`;
  return stem;
};

export const suggestLessonPlanFilename = title => safeStem(title) || FALLBACK_STEM;

export const resolveLessonPlanDownloadFilename = (input, title) =>
  `${safeStem(input) || suggestLessonPlanFilename(title)}.pdf`;
