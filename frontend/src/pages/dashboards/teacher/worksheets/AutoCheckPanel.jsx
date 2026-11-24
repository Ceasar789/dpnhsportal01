// 4f (R45 / R46, AI-checking OFF design, renamed per Q1): what Auto-check
// does for this worksheet, under the existing on/off checkbox. The checker is
// rule-based (lib/worksheetChecking.js): it compares answers with the answer
// key; no AI runs and nothing is sent to Gemini.
//
// R46: choosing WHICH types it checks needs the proposed column
// worksheets.auto_check_types and a scorer update (autorun/sql/4f). Until then
// VITE_AUTO_CHECK_TYPES_ENABLED stays off and the list below is information only.
import { AUTO_CHECK_TYPES, autoCheckTypesFlagEnabled } from './autoCheckTypes';

const LABELS = { multiple_choice: 'Multiple choice', identification: 'Identification', true_false: 'True or false' };

export default function AutoCheckPanel({ on, types = AUTO_CHECK_TYPES, onTypesChange, dark }) {
  const muted = { color: 'var(--text-muted)' };
  const box = { border: '1px solid var(--border)', backgroundColor: 'var(--card2)' };
  const choosing = on && autoCheckTypesFlagEnabled() && typeof onTypesChange === 'function';
  if (!on) {
    return (
      <div role="note" aria-label="Auto-check is off" className="rounded-lg p-3 text-sm grid gap-2" style={box}>
        <p className="font-semibold" style={{ color: 'var(--text)' }}>Off · You check this worksheet manually</p>
        <p style={muted}><strong style={{ color: 'var(--text)' }}>You review every submission.</strong> All question types,
          including multiple choice, identification, and true or false, go to Grading for you to check.</p>
        <p style={muted}><strong style={{ color: 'var(--text)' }}>You release the scores.</strong> Students see their score
          only after you release it in Grading.</p>
      </div>
    );
  }
  return (
    <div role="note" aria-label="Auto-check is on" className="rounded-lg p-3 text-sm grid gap-2" style={box}>
      <p className="font-semibold" style={{ color: 'var(--text)' }}>On · Rule-based, no AI</p>
      <p style={muted}>Answers are compared with your answer key. You can still mark any item correct or edit a score before you release.</p>
      {choosing ? (
        <fieldset className="grid gap-1">
          <legend className="font-medium" style={{ color: 'var(--text)' }}>Auto-check scores these question types</legend>
          {AUTO_CHECK_TYPES.map(type => (
            <label key={type} className="flex items-center gap-2 min-h-11" style={{ color: dark ? '#cbd5e1' : 'var(--text)' }}>
              <input type="checkbox" checked={types.includes(type)}
                onChange={event => onTypesChange(event.target.checked ? [...types, type] : types.filter(t => t !== type))} />
              {LABELS[type]}
            </label>
          ))}
        </fieldset>
      ) : (
        <div>
          <p className="font-medium" style={{ color: 'var(--text)' }}>Auto-check scores these question types</p>
          <ul className="list-disc pl-5" style={muted}>{AUTO_CHECK_TYPES.map(type => <li key={type}>{LABELS[type]}</li>)}</ul>
        </div>
      )}
      <p style={muted}>Essay, handwriting, drawing and arts are always checked by you.</p>
    </div>
  );
}
