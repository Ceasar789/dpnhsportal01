// ============================================
// FILE: src/components/clarity/GettingStartedCard.jsx
// V2a: the first-time "Getting started" card on each Clarity Overview.
// A few numbered steps, each with one button that opens the right page.
// A step counts as done once its button (or, for a step with two buttons,
// both of them) has been used. The card is gone
// for good when it is hidden or every step is done. Only this browser
// remembers it (localStorage, per role and user); nothing is sent to the
// database. Blocked storage simply means the card shows again.
// ============================================

import { useId, useState } from 'react';
import { Check, X } from 'lucide-react';
import { gettingStartedKey, readGettingStarted, writeGettingStarted } from '../../lib/gettingStarted';

// steps: [{ id, title, text, action, go }] in order, or { id, title, text,
// actions: [{ id, label, go }] } for a step with two pages. uid keeps one card
// per person on a shared computer.

// One step's buttons, each with the id stored when it is used.
const actionsOf = step => step.actions || [{ id: step.id, label: step.action, go: step.go }];

const GettingStartedCard = ({ role, uid, steps }) => {
  const key = gettingStartedKey(role, uid);
  // The user id can arrive after the first render: re-read for a new key.
  const [saved, setSaved] = useState(() => ({ key, ...readGettingStarted(key) }));
  const state = saved.key === key ? saved : { key, ...readGettingStarted(key) };
  const headingId = useId();

  const save = ({ hidden, done }) => { setSaved({ key, hidden, done }); writeGettingStarted(key, { hidden, done }); };
  const isDone = step => actionsOf(step).every(action => state.done.includes(action.id));
  if (state.hidden || steps.every(isDone)) return null;

  const open = (action) => {
    if (!state.done.includes(action.id)) save({ ...state, done: [...state.done, action.id] });
    action.go();
  };

  return (
    <section className="x-card x-pad" aria-labelledby={headingId} style={{ marginBottom: 16 }}>
      <div className="x-krow" style={{ alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <h2 className="x-ct" id={headingId}>Getting started</h2>
          <p className="x-cs">A few first steps. This card goes away when you are done.</p>
        </div>
        <button type="button" className="x-iconbtn" aria-label="Hide getting started" title="Hide getting started" style={{ flexShrink: 0 }}
          onClick={() => save({ ...state, hidden: true })}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <ol className="x-rows" style={{ marginTop: 8 }}>
        {steps.map((step, index) => {
          const done = isDone(step);
          return (
            <li key={step.id} style={{ flexWrap: 'wrap' }}>
              <span className="x-ico" aria-hidden="true">{done ? <Check size={16} /> : index + 1}</span>
              <div className="g" style={{ minWidth: 160 }}>
                <span className="t" id={`${headingId}-${step.id}`} style={{ display: 'block' }}>
                  {step.title}{done && <span className="x-sr"> (done)</span>}
                </span>
                <span className="m" style={{ display: 'block' }}>{step.text}</span>
              </div>
              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {actionsOf(step).map(action => (
                  <button key={action.id} type="button" className="x-btn" aria-describedby={`${headingId}-${step.id}`} onClick={() => open(action)}>{action.label}</button>
                ))}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
};

export default GettingStartedCard;
