// ============================================
// FILE: src/components/ui/form/ToggleChoice.jsx
// T1 form kit: one choice out of 2 to 4 short options, shown as a toggle
// with a sliding thumb (Checking: Auto-check / Manual check, File / Link).
// Native radios underneath, laid over each option and transparent, so the
// browser and screen readers treat it exactly as the radio group it was:
// "Checking, group; Auto-check, radio button, checked, 1 of 2". Arrow keys
// move and select, Tab enters at the checked option, a disabled group is
// skipped. The help sentence of the chosen option shows under the toggle;
// all sentences share one grid cell, so switching never moves the layout.
// Each radio carries `disabled` itself too (a disabled fieldset does not set
// input.disabled).
// `note` (a reason, a status) is shown under it and read with each option.
// ============================================

import { useId } from 'react';
import '../../../styles/form-kit.css';

export default function ToggleChoice({ legend, name, options = [], value, onChange, disabled = false, note }) {
  const base = `fk-tg${useId().replace(/:/g, '')}`;
  const index = options.findIndex(o => o.value === value);
  const hasHelp = options.some(o => o.help);
  const helpId = `${base}-help`;
  const noteId = `${base}-note`;
  const describedBy = [hasHelp && index >= 0 ? helpId : null, note ? noteId : null].filter(Boolean).join(' ') || undefined;

  return (
    <fieldset className="fk-choice fk-tg-field" disabled={disabled}>
      <legend className="fk-label">{legend}</legend>
      <div className="fk-tg" data-empty={index < 0 || undefined} style={{ '--fk-n': options.length, '--fk-i': Math.max(index, 0) }}>
        <span className="fk-tg-thumb" aria-hidden="true" />
        {options.map(option => (
          <label key={option.value} className="fk-tg-opt">
            <input type="radio" className="fk-tg-input" name={name} value={option.value}
              checked={option.value === value} disabled={disabled} aria-describedby={describedBy}
              onChange={() => onChange?.(option.value)} />
            <span className="fk-tg-text">{option.label}</span>
          </label>
        ))}
      </div>
      {hasHelp && <div className="fk-tg-helps">
        {options.map((option, i) => (
          <p key={option.value} className="fk-help" id={i === index ? helpId : undefined}
            data-on={i === index || undefined} aria-hidden={i === index ? undefined : 'true'}>{option.help}</p>
        ))}
      </div>}
      {note && <div className="fk-tg-note" id={noteId}>{note}</div>}
    </fieldset>
  );
}
