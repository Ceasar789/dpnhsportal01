// ============================================
// FILE: src/components/ui/form/SegmentedChoice.jsx
// U2 form kit: a small set of choices shown side by side (the Role picker
// in U3: Student / Teacher / Admin). Radio-group semantics:
//   role="radiogroup" labelled by the legend; each option role="radio"
//   with aria-checked. One tab stop for the whole group (the checked
//   option, else the first enabled one). Arrow keys move AND select, and
//   wrap; Home/End jump to the ends; Space or Enter selects the focused
//   option. Disabled options are skipped.
//   Targets are 40px tall on desktop and 44px on phones (form-kit.css).
// ============================================

import { useId, useRef } from 'react';
import '../../../styles/form-kit.css';

const NEXT = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

export default function SegmentedChoice({ legend, options = [], value, onChange, disabled = false, help, error, optional = false, name, id }) {
  const base = useId().replace(/:/g, '');
  // A fixed `id` gives stable ids (legend `${id}-label`, help, error).
  const legendId = id ? `${id}-label` : `fk-seg${base}`;
  const helpId = `${legendId}-help`;
  const errorId = `${legendId}-error`;
  const buttons = useRef([]);

  const enabled = options.map((o, i) => (!disabled && !o.disabled ? i : -1)).filter(i => i >= 0);
  const checkedIndex = options.findIndex(o => o.value === value);
  const tabIndexOf = checkedIndex >= 0 && enabled.includes(checkedIndex) ? checkedIndex : enabled[0];

  const choose = (index) => {
    const option = options[index];
    if (!option || !enabled.includes(index)) return;
    buttons.current[index]?.focus();
    if (option.value !== value) onChange?.(option.value);
  };

  const onKeyDown = (event, index) => {
    if (!enabled.length) return;
    let target = null;
    if (event.key in NEXT) {
      const at = enabled.indexOf(index);
      const from = at === -1 ? 0 : at;
      target = enabled[(from + NEXT[event.key] + enabled.length) % enabled.length];
    } else if (event.key === 'Home') target = enabled[0];
    else if (event.key === 'End') target = enabled[enabled.length - 1];
    else if (event.key === ' ' || event.key === 'Enter') target = index;
    if (target == null) return;
    event.preventDefault();
    choose(target);
  };

  return (
    <div className="fk-choice">
      <span className="fk-label" id={legendId}>
        {legend}
        {optional && <span className="fk-optional">Optional</span>}
      </span>
      <div
        className="fk-seg"
        role="radiogroup"
        aria-labelledby={legendId}
        aria-describedby={[error ? errorId : null, help ? helpId : null].filter(Boolean).join(' ') || undefined}
        aria-invalid={error ? 'true' : undefined}
        aria-required={optional ? undefined : 'true'}
        aria-disabled={disabled || undefined}
        data-name={name}
      >
        {options.map((option, index) => {
          const checked = option.value === value;
          const off = disabled || option.disabled;
          return (
            <button
              key={option.value}
              ref={(el) => { buttons.current[index] = el; }}
              type="button"
              role="radio"
              className="fk-seg-opt"
              aria-checked={checked}
              aria-disabled={off || undefined}
              tabIndex={index === tabIndexOf ? 0 : -1}
              onClick={() => choose(index)}
              onKeyDown={(event) => onKeyDown(event, index)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
      {help && <p className="fk-help" id={helpId}>{help}</p>}
      <p className="fk-error" id={errorId} aria-live="polite">{error || ''}</p>
    </div>
  );
}
