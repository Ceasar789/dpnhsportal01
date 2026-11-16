// ============================================
// FILE: src/components/ui/form/PasswordField.jsx
// U2 form kit: a password input with a show/hide button and, when `rules`
// are given, a live checklist under it (decision D3). No rules are written
// here: the caller passes them (lib/formRules.js passwordRules builds them
// from the app's policy), each { id, label, test(value) => boolean }.
//
//   autoComplete  'new-password' (default; set or reset) or
//                 'current-password' (sign in, confirm identity)
//   The toggle is a 40px button (44px on phones) with an accessible name
//   that says what it will do, and aria-pressed for its state. It never
//   submits the form and keeps focus where it is.
//   The checklist is described-by the input, so a screen reader hears the
//   rules on focus; each item says "done" or "not yet" in words, not only
//   with a colour or an icon.
// ============================================

import { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import Field from './Field';

export default function PasswordField({
  label = 'Password',
  value = '',
  onChange,
  onBlur,
  rules = [],
  autoComplete = 'new-password',
  name,
  id,
  optional,
  help,
  error,
  validate,
  onValidate,
  disabled,
}) {
  const [visible, setVisible] = useState(false);
  const rulesId = `fk-rules${useId().replace(/:/g, '')}`;
  const hasRules = Array.isArray(rules) && rules.length > 0;

  return (
    <Field label={label} id={id} optional={optional} help={help} error={error} validate={validate} onValidate={onValidate}>
      {(props) => (
        <>
          <div className="fk-pw">
            <input
              {...props}
              aria-describedby={[props['aria-describedby'], hasRules ? rulesId : null].filter(Boolean).join(' ') || undefined}
              type={visible ? 'text' : 'password'}
              name={name}
              value={value}
              autoComplete={autoComplete}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={disabled}
              onChange={(event) => { onChange?.(event); props.onChange(event); }}
              onBlur={(event) => { onBlur?.(event); props.onBlur(event); }}
            />
            <button
              type="button"
              className="fk-pw-toggle"
              aria-label={visible ? 'Hide password' : 'Show password'}
              aria-pressed={visible}
              aria-controls={props.id}
              disabled={disabled}
              onClick={() => setVisible(v => !v)}
            >
              {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
            </button>
          </div>
          {hasRules && (
            <ul className="fk-rules" id={rulesId} aria-label="Password rules">
              {rules.map((rule) => {
                const met = Boolean(rule.test(value));
                return (
                  <li key={rule.id} className="fk-rule" data-met={met ? 'true' : 'false'}>
                    <span className="fk-rule-mark" aria-hidden="true">{met ? '✓' : '○'}</span>
                    <span>{rule.label}</span>
                    <span className="fk-sr">{met ? ', done' : ', not yet'}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Field>
  );
}
