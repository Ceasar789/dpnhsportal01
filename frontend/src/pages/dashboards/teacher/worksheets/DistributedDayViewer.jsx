import { Btn, Modal } from '../shared/ui';
import depedLogo from '../ilaw/assets/deped-logo.png';
import schoolSeal from '../ilaw/assets/school-seal.png';
import eduscribeLogo from '../ilaw/assets/eduscribe-logo.png';

const LETTERHEAD = [
  'Republic of the Philippines',
  'Department of Education',
  'Region IVA-CALABARZON',
  'City Schools Division of Biñan City',
  'DELA PAZ NATIONAL HIGH SCHOOL',
  'P. Paterno St., Dela Paz, Biñan City, Laguna',
];
const TYPES = [
  ['multiple_choice', 'Multiple choice'], ['true_false', 'True or false'],
  ['identification', 'Identification'], ['enumeration', 'Enumeration'], ['essay', 'Essay'],
];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

export default function DistributedDayViewer({ day, hasUnsavedChanges, onClose }) {
  const answers = new Map((day.answerKey || []).map(key => [key.localId, key.correct_answer]));
  const ordered = day.questions.map((item, index) => ({ item,
    position: Number.isSafeInteger(item.position) ? item.position : index + 1 }))
    .sort((a, b) => a.position - b.position);
  const groups = [...TYPES.map(([type, title]) => ({ title,
    items: ordered.filter(row => row.item.item_type === type) })),
  { title: 'Other questions', items: ordered.filter(row => !TYPES.some(([type]) => row.item.item_type === type)) }]
    .filter(group => group.items.length);
  const totalPoints = Math.round(day.questions.reduce((sum, item) => {
    const points = Number(item.points);
    return sum + (Number.isFinite(points) ? points : 0);
  }, 0) * 100) / 100;
  const checkingLabel = day.checkingMode === 'auto' ? 'Auto-check'
    : day.checkingMode === 'manual' ? 'Manual check' : null;
  let questionNumber = 0;

  return <Modal title={`${day.day} worksheet (distributed)`} size="max-w-4xl"
    onClose={onClose} escapeCloses>
    <div className="space-y-4">
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        Read-only. This day was distributed and can no longer be edited.
      </p>
      {hasUnsavedChanges && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        This editor has unsaved changes, so this view may differ from what students received.
      </p>}
      {checkingLabel && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        Checking: {checkingLabel}
      </p>}
      <article aria-label="Distributed worksheet test paper" className="rounded-lg border p-5 sm:p-8 space-y-6"
        style={{ backgroundColor: '#fffefb', color: '#1f1f1f', borderColor: '#d8cfc1', fontFamily: 'Georgia, Times New Roman, serif' }}>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b pb-4 text-center"
          style={{ borderColor: '#b7a999' }}>
          <img className="h-12 w-12 object-contain" src={depedLogo} alt="Department of Education logo" />
          <div className="flex-1 min-w-[180px] text-xs leading-snug">
            {LETTERHEAD.map((line, index) => <p key={line} className={index === 4 ? 'font-bold' : undefined}>{line}</p>)}
          </div>
          <div className="flex items-center gap-2" aria-label="School and EduScribe branding">
            <img className="h-12 w-12 object-contain" src={schoolSeal} alt="Dela Paz National High School seal" />
            <img className="h-12 w-12 object-contain" src={eduscribeLogo} alt="EduScribe logo" />
          </div>
        </header>
        <div className="text-center">
          <h2 className="text-lg font-bold tracking-wide">WORKSHEET</h2>
          <p className="mt-1 font-semibold break-words">{day.title}</p>
          <p className="mt-2 text-sm">Total points: {totalPoints}</p>
        </div>
        {day.instructions?.trim() && <section className="rounded border px-4 py-3"
          style={{ borderColor: '#b7a999', backgroundColor: '#fffaf0' }}>
          <h3 className="font-semibold">Directions</h3>
          <p className="whitespace-pre-wrap break-words">{day.instructions}</p>
        </section>}
        {groups.map((group, groupIndex) => {
          const start = questionNumber;
          questionNumber += group.items.length;
          const points = group.items[0].item.points;
          const equalPoints = points != null && group.items.every(({ item }) => item.points === points);
          return <section key={group.title} className="space-y-3" aria-label={`${ROMAN[groupIndex]}. ${group.title}`}>
            <h3 className="font-bold">{ROMAN[groupIndex]}. {group.title}
              {equalPoints && ` (${points} ${Number(points) === 1 ? 'point' : 'points'} each)`}
            </h3>
            <ol className="space-y-3">
              {group.items.map(({ item }, index) => {
                const answer = answers.get(item.localId);
                const answerText = Array.isArray(answer) ? answer.join(', ') : answer;
                return <li key={item.localId} className="rounded border p-3" style={{ borderColor: '#d8cfc1' }}>
                  <p className="font-semibold whitespace-pre-wrap break-words">{start + index + 1}. {item.question}</p>
                  {item.points != null && <p className="text-xs" style={{ color: '#4b4945' }}>
                    {item.points} {Number(item.points) === 1 ? 'point' : 'points'}
                  </p>}
                  {item.item_type === 'multiple_choice' && Array.isArray(item.options) && <ul className="mt-2 space-y-1">
                    {item.options.map((option, optionIndex) => <li key={optionIndex} className="flex gap-2 break-words">
                      <span className="font-semibold">{String.fromCharCode(65 + optionIndex)}.</span>
                      <span>{option}{answer === option && <strong className="ml-2">Correct answer</strong>}</span>
                    </li>)}
                  </ul>}
                  {['true_false', 'identification', 'enumeration'].includes(item.item_type)
                    && answerText != null && answerText !== '' && <p className="mt-2 break-words">Answer: {answerText}</p>}
                  {item.item_type === 'essay' && item.essay && <div className="mt-2 space-y-1">
                    {item.essay.referenceAnswer?.trim() && <p className="whitespace-pre-wrap break-words">
                      Reference answer: {item.essay.referenceAnswer}
                    </p>}
                    {item.essay.minWords != null && item.essay.maxWords != null
                      && <p>Word range: {item.essay.minWords}–{item.essay.maxWords} words</p>}
                  </div>}
                </li>;
              })}
            </ol>
          </section>;
        })}
      </article>
      <div className="flex justify-end"><Btn variant="outline" onClick={onClose}>Close</Btn></div>
    </div>
  </Modal>;
}
