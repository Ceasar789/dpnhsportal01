// ============================================
// FILE: src/components/ui/form/Field.jsx
// U2 form kit: one labelled field. The label sits above the control,
// "Optional" follows the label of an optional field (required fields carry
// no mark: decision D2), then the control, help text, and the error.
//
// The control is the single child (input, select or textarea), or a render
// function that receives the control props (PasswordField uses that to put
// a show/hide button next to its input). Field wires:
//   id                  the child's own id, else `id`, else a generated one
//   aria-describedby    error id, then help id (plus any the child had)
//   aria-invalid        "true" while an error shows
//   aria-required       "true" unless the field is optional
//   className           "fk-control" added
//
// Validation (decision D1: on blur AND on submit):
//   `error`     the parent's message (e.g. after a submit). It always wins.
//   `validate`  value => message | null. Run on blur, but only once the
//               person has changed the field, so tabbing past an empty
//               field stays quiet. Once a blur message shows, it is
//               re-checked as they type, so it clears the moment the value
//               is fixed. `onValidate(message)` reports each result.
// ============================================

import { Children, cloneElement, isValidElement, useId, useState } from 'react';
import '../../../styles/form-kit.css';

const valueOf = target => (target && 'value' in target ? target.value : undefined);

export default function Field({
  label,
  optional = false,
  help,
  error,
  validate,
  onValidate,
  id,
  className = '',
  children,
}) {
  const generated = useId();
  const [changed, setChanged] = useState(false);
  const [blurError, setBlurError] = useState(null);

  const child = typeof children === 'function' ? null : Children.only(children);
  const childProps = isValidElement(child) ? child.props : {};
  const fieldId = childProps.id || id || `fk${generated.replace(/:/g, '')}`;
  const helpId = `${fieldId}-help`;
  const errorId = `${fieldId}-error`;
  const shown = error || blurError || null;

  const run = (value) => {
    if (typeof validate !== 'function') return;
    const message = validate(value) || null;
    setBlurError(message);
    onValidate?.(message);
  };

  const controlProps = (own = {}) => ({
    id: fieldId,
    className: ['fk-control', own.className].filter(Boolean).join(' '),
    'aria-invalid': shown ? 'true' : undefined,
    'aria-required': optional ? undefined : 'true',
    'aria-describedby': [own['aria-describedby'], shown ? errorId : null, help ? helpId : null].filter(Boolean).join(' ') || undefined,
    onChange: (event) => {
      if (!changed) setChanged(true);
      own.onChange?.(event);
      // An error is showing (from blur or from the parent): re-check live
      // and report, so the parent can clear its own submit message too.
      if (shown) run(valueOf(event.target));
    },
    onBlur: (event) => {
      own.onBlur?.(event);
      if (changed) run(valueOf(event.target));
    },
  });

  const control = typeof children === 'function'
    ? children(controlProps())
    : cloneElement(child, controlProps(childProps));

  return (
    <div className={['fk-field', className].filter(Boolean).join(' ')}>
      <label className="fk-label" htmlFor={fieldId}>
        {label}
        {optional && <span className="fk-optional">Optional</span>}
      </label>
      {control}
      {help && <p className="fk-help" id={helpId}>{help}</p>}
      {/* Always in the DOM so a message that appears is announced. */}
      <p className="fk-error" id={errorId} aria-live="polite">{shown || ''}</p>
    </div>
  );
}
