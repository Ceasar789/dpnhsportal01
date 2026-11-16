// ============================================
// FILE: src/pages/dashboards/admin/shared/FormDialog.jsx
// U4: the frame every admin form dialog shares, so the six of them behave
// the same way the U3 user dialog does:
//   - the shared Modal (focus, Escape, backdrop, Tab cycling)
//   - the error summary at the top after a failed submit, focus on the
//     first invalid field (FormErrorSummary)
//   - unsaved changes ask through the in-app ConfirmDialog, rendered inside
//     the Modal, with the Modal's keys suspended while it is open
//   - the primary button is never disabled: it shows its busy label, and a
//     second press while a save runs is ignored (useFormDialog's guard)
//   - footer buttons keep focus in the field on mouse down, so a blur check
//     cannot move the button out from under the pointer (as in U3)
// The fields themselves are the kit's Field, inside `children`.
// ============================================

import { useState } from 'react';
import Modal from '../../../../components/ui/Modal';
import ConfirmDialog from '../../../../components/ui/ConfirmDialog';
import FormErrorSummary from '../../../../components/ui/form/FormErrorSummary';

const keepFocus = event => event.preventDefault();

export default function FormDialog({
  title,
  onClose,
  summaryId,
  form,
  primaryLabel,
  busyLabel,
  saving = false,
  onSubmit,
  extraActions,
  cancelLabel = 'Cancel',
  children,
}) {
  const [confirming, setConfirming] = useState(null);

  return (
    <Modal
      open
      title={title}
      onClose={onClose}
      onDiscardRequest={proceed => setConfirming(() => proceed)}
      keysSuspended={Boolean(confirming)}
      footer={requestClose => (
        <div className="fk-footer">
          {extraActions}
          <button type="button" className="fk-btn" onMouseDown={keepFocus} onClick={requestClose}>{cancelLabel}</button>
          {onSubmit && (
            <button type="button" className="fk-btn fk-primary" aria-busy={saving || undefined} onMouseDown={keepFocus} onClick={onSubmit}>
              {saving ? busyLabel : primaryLabel}
            </button>
          )}
        </div>
      )}
    >
      <FormErrorSummary id={summaryId} errors={form.summary} attempt={form.attempt} focusTo="first-field" />
      {children}
      {confirming && (
        <ConfirmDialog
          onCancel={() => setConfirming(null)}
          onConfirm={() => { const proceed = confirming; setConfirming(null); proceed(); }}
        />
      )}
    </Modal>
  );
}
