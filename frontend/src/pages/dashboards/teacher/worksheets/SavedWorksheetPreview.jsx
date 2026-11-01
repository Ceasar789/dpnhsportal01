import { useEffect, useRef, useState } from 'react';
import { TRUE_FALSE_VALUES } from '../../../../lib/worksheetChecking';
import { Modal } from '../shared/ui';

const answerText = value => {
  if (value === null || value === undefined) return 'Unavailable';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value) ?? String(value); }
  catch { return String(value); }
};

export default function SavedWorksheetPreview({ worksheet, loadItems, onClose }) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const activeRef = useRef(true);

  useEffect(() => {
    let active = true;
    activeRef.current = true;
    setLoading(true);
    setLoadFailed(false);
    setResult(null);
    setShowAnswerKey(false);
    Promise.resolve().then(() => loadItems(worksheet.id)).then(data => {
      if (!active || !activeRef.current) return;
      if (!data || !Array.isArray(data.items) || data.items.length === 0) setLoadFailed(true);
      else setResult(data);
    }).catch(() => {
      if (active && activeRef.current) setLoadFailed(true);
    }).finally(() => {
      if (active && activeRef.current) setLoading(false);
    });
    return () => { active = false; activeRef.current = false; };
  }, [worksheet.id]);

  const close = () => { activeRef.current = false; onClose(); };
  const ordered = [...(result?.items || [])].sort((a, b) => a.position - b.position)
    .map((item, index) => ({ item, number: index + 1 }));
  const sections = Array.isArray(worksheet.sections) ? worksheet.sections : [];
  const grouped = sections.map(section => ({ section,
    questions: ordered.filter(({ item }) => item.sectionId === section.id) }))
    .filter(group => group.questions.length);
  const ungrouped = ordered.filter(({ item }) => !sections.some(section => item.sectionId === section.id));
  const renderQuestions = questions => <ol className="space-y-3">
    {questions.map(({ item, number }) => {
      const options = item.item_type === 'true_false' ? TRUE_FALSE_VALUES
        : item.item_type === 'multiple_choice' && Array.isArray(item.options) ? item.options : [];
      return <li key={item.id} className="rounded-lg border p-3" style={{ borderColor: 'var(--border)' }}>
        <h4 className="font-semibold break-words">{number}. {item.question}</h4>
        <p className="text-xs">{item.points} points</p>
        {options.length > 0 && <ul className="list-disc pl-5">
          {options.map((option, index) => <li key={`${item.id}-option-${index}`}>{String(option)}</li>)}
        </ul>}
        {showAnswerKey && <p className="text-sm">Answer key: {answerText(result.keys?.[item.id]?.correct_answer)}</p>}
      </li>;
    })}
  </ol>;

  return <Modal title={`Preview: ${worksheet.title}`} onClose={close} dismissible>
    {loading ? <p role="status">Loading questions...</p> : loadFailed ? <p>Could not load the questions.</p> : <div className="space-y-4">
      <h3 className="font-semibold break-words">{worksheet.title}</h3>
      <p>{ordered.length} questions</p>
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={showAnswerKey} onChange={event => setShowAnswerKey(event.target.checked)} />
        Show answer key
      </label>
      {grouped.map(({ section, questions }) => <section key={section.id} className="space-y-2">
        <h3 className="font-semibold break-words">{section.title}</h3>
        {section.directions && <p className="text-sm">{section.directions}</p>}
        {renderQuestions(questions)}
      </section>)}
      {ungrouped.length > 0 && renderQuestions(ungrouped)}
    </div>}
  </Modal>;
}
