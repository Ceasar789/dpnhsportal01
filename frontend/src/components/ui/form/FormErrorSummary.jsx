// ============================================
// FILE: src/components/ui/form/FormErrorSummary.jsx
// U2 form kit: the box that appears at the top of a form after a failed
// submit. It says how many things need fixing and lists them as links;
// following a link moves focus to that field.
//
// `errors`   [{ fieldId, message }] in form order; nothing renders when empty
// `attempt`  a number the form bumps on every failed submit. Each new value
//            moves focus again (so a second failed submit is announced too)
// `focusTo`  'summary' (default): focus the summary, which is role="alert"
//            and is announced once; 'first-field': focus the first invalid
//            field directly (for short forms, where the summary is enough
//            to read on the way)
// ============================================

import { useEffect, useId, useRef } from 'react';
import '../../../styles/form-kit.css';

const focusField = (fieldId) => {
  const el = typeof document !== 'undefined' ? document.getElementById(fieldId) : null;
  if (el && typeof el.focus === 'function') { el.focus(); return true; }
  return false;
};

export default function FormErrorSummary({ errors = [], attempt = 0, focusTo = 'summary', title }) {
  const box = useRef(null);
  const titleId = useId();
  const list = errors.filter(e => e && e.fieldId && e.message);
  const count = list.length;
  // Read at focus time. Only a new failed submit (a new `attempt`) moves
  // focus; the list shrinking as fields are fixed must not pull focus away
  // from the field being typed in.
  const latest = useRef({});
  useEffect(() => { latest.current = { count, firstId: list[0]?.fieldId, focusTo }; });

  useEffect(() => {
    const { count: n, firstId, focusTo: to } = latest.current;
    if (!n || !attempt) return;
    if (to === 'first-field' && focusField(firstId)) return;
    box.current?.focus();
  }, [attempt]);

  if (!count) return null;
  const heading = title || (count === 1 ? 'Please fix 1 thing:' : `Please fix ${count} things:`);

  return (
    <div ref={box} className="fk-summary" role="alert" tabIndex={-1} aria-labelledby={titleId}>
      <p className="fk-summary-title" id={titleId}>{heading}</p>
      <ul className="fk-summary-list">
        {list.map(({ fieldId, message }) => (
          <li key={fieldId}>
            <a href={`#${fieldId}`} onClick={(event) => { event.preventDefault(); focusField(fieldId); }}>{message}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}
