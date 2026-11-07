// Saved rows into the draft shape WorksheetDraftDocument reads. Every value is
// coerced because the template renders them directly: a non-string child or a
// non-array option list would crash it.

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '');

const position = item => {
  const value = Number(item.position);
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
};

function answerValue(answer) {
  if (Array.isArray(answer)) {
    const list = answer.map(text).filter(Boolean);
    return list.length ? list : undefined;
  }
  if (typeof answer === 'boolean') return String(answer);
  return text(answer) || undefined;
}

function savedSections(sections) {
  const list = (Array.isArray(sections) ? sections : []).filter(section => isRecord(section) && text(section.id))
    .map(section => ({ id: text(section.id), title: text(section.title), directions: text(section.directions) }));
  return list.length ? list : undefined;
}

export function savedWorksheetToDraft({ worksheet, items, keys } = {}) {
  const source = isRecord(worksheet) ? worksheet : {};
  const sections = savedSections(source.sections);
  // The template only shows a question inside a section with its exact id. Any
  // other id would make that question disappear from the document.
  const sectionFor = (id) => {
    if (!sections) return undefined;
    return sections.some(section => section.id === id) ? id : sections[0].id;
  };
  const ordered = (Array.isArray(items) ? items : []).filter(isRecord)
    .map((item, index) => ({ item, index, localId: text(item.id) || `item-${index + 1}` }))
    .sort((a, b) => position(a.item) - position(b.item) || a.index - b.index);

  return {
    title: text(source.title),
    subjectName: text(source.subject),
    gradeLevel: text(source.grade_level),
    instructions: text(source.instructions),
    ...(sections ? { sections } : {}),
    questions: ordered.map(({ item, localId }) => {
      const points = Number(item.points);
      return {
        localId,
        question: text(item.question),
        item_type: text(item.item_type),
        options: Array.isArray(item.options) ? item.options.map(text).filter(Boolean) : [],
        points: Number.isFinite(points) ? points : 0,
        sectionId: sectionFor(item.sectionId),
      };
    }),
    answerKey: ordered.map(({ item, localId }) => ({ localId,
      correct_answer: answerValue(isRecord(keys) ? keys[item.id]?.correct_answer : undefined) })),
  };
}
