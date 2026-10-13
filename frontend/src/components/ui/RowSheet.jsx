// ============================================
// FILE: src/components/ui/RowSheet.jsx
//
// Rule R5: on a phone a table row shows two lines, and tapping it opens
// the whole record. This is that sheet.
//
// It is a <Modal>, not a new overlay. Modal already owns the focus
// contract — focus in, trapped, returned to the opener, Escape, a backdrop
// that needs press and release on itself — and index.css already renders
// it as a bottom sheet on a narrow screen. A second overlay would be a
// second copy of all of that to keep correct.
//
// What this adds is the shape of the content: a definition list of every
// column the mobile row had to drop, and the row's own actions, which are
// otherwise unreachable once the actions cell is hidden.
// ============================================

import Modal from './Modal';

// No subtitle. It carried a value that the detail list carried again -
// "Grade 10" above "Grade level: Grade 10" - and of the two the labelled
// one is the one that explains itself. One rule for every sheet: the title
// identifies the record, and every other value is labelled exactly once.
export default function RowSheet({ open, title, details = [], actions, onClose }) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      // Nothing here is editable, so there is never unsaved work to guard.
      // Without this the snapshot check would compare an empty form to an
      // empty form on every close — harmless, but it would also prompt if
      // a future detail row ever held an input.
      isDirty={() => false}
      footer={(requestClose) => (
        <>
          {actions}
          <button type="button" className="btn btn-ghost" onClick={requestClose}>Close</button>
        </>
      )}
    >
      <dl className="row-sheet">
        {details.filter(([, value]) => value !== undefined && value !== null && value !== '').map(([label, value]) => (
          <div className="row-sheet-pair" key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
