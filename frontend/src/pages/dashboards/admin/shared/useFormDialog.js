// ============================================
// FILE: src/pages/dashboards/admin/shared/useFormDialog.js
// U4: the form state every admin form dialog shares (see FormDialog.jsx).
// ============================================

import { useRef, useState } from 'react';

/**
 * The form state every dialog needs: field errors, the failed-submit count
 * that moves focus, and the double-submit guard.
 * @param {string[]} order  field ids in the order they appear
 */
export default function useFormDialog(order) {
  const [errors, setErrors] = useState({});
  const [attempt, setAttempt] = useState(0);
  const busy = useRef(false);

  const fail = (problems) => {
    setErrors(Object.fromEntries(problems.map(p => [p.fieldId, p.message])));
    setAttempt(a => a + 1);
  };

  /**
   * Validate, then save. `save` resolves to { ok, fieldErrors? } (or a bare
   * boolean from an older caller); field errors from the server land on
   * their fields, anything else was already said by a toast.
   */
  const submit = async (problems, save) => {
    if (busy.current) return;
    if (problems.length) { fail(problems); return; }
    setErrors({});
    busy.current = true;
    try {
      const result = await save();
      if (result?.fieldErrors?.length) fail(result.fieldErrors);
    } finally {
      busy.current = false;
    }
  };

  const summary = Object.entries(errors)
    .filter(([, message]) => message)
    .map(([fieldId, message]) => ({ fieldId, message }))
    .sort((a, b) => order.indexOf(a.fieldId) - order.indexOf(b.fieldId));

  return {
    errors,
    summary,
    attempt,
    submit,
    fieldError: id => errors[id] || undefined,
    // Field's onValidate: a fixed field clears its own submit message.
    clearError: id => message => { if (!message) setErrors(e => (e[id] ? { ...e, [id]: undefined } : e)); },
  };
}
