import { useId, useState } from 'react';
import { AlertTriangle, LogOut } from 'lucide-react';
import Modal from '../../../../components/ui/Modal';
import Button from '../../../../components/ui/Button';
import { roleBadge, roleLabel } from './helpers';

// The type-the-name field. Its own component so its useId never shifts the
// ids of dialogs that do not use it.
const TypeToConfirm = ({ name, value, onChange }) => {
  const id = useId();
  return (
    <div style={{ marginTop: 'var(--space-16)', textAlign: 'left' }}>
      <label className="form-label" htmlFor={id}>Type <strong>{name}</strong> to confirm</label>
      <input id={id} className="form-input" value={value} autoComplete="off" spellCheck={false}
        onChange={event => onChange(event.target.value)} />
    </div>
  );
};

// details, counts, recommendation and confirmName are optional. With none of
// them the dialog renders exactly as it always has (ConfirmationDialog.defaults.test.jsx).
//   details        list of plain-text lines, e.g. everything a delete removes
//   counts         [{ label, value }] shown as a list; value is display text
//   recommendation one muted line under the warning
//   confirmName    when set, the confirm button stays disabled until this exact text is typed
const ConfirmationDialog = ({
  open,
  title,
  description,
  subject,
  role,
  warning,
  confirmLabel,
  destructive = false,
  busy = false,
  busyLabel = 'Deleting…',
  onCancel,
  onConfirm,
  details,
  counts,
  recommendation,
  confirmName,
}) => {
  const Icon = destructive ? AlertTriangle : LogOut;
  // Typed text is cleared whenever the dialog closes, so a reopened dialog starts empty.
  const [typed, setTyped] = useState('');
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) setTyped('');
  }
  const nameMatches = !confirmName || typed === confirmName;

  return (
    <Modal
      open={open}
      title={title}
      onClose={() => { if (!busy) onCancel(); }}
      // The typed name is a confirmation, not unsaved work: Cancel must not ask "Discard changes?".
      {...(confirmName ? { isDirty: () => false } : {})}
      footer={(requestClose) => (
        <>
          <Button variant="ghost" aria-disabled={busy || undefined}
            onClick={() => { if (!busy) requestClose(); }}>Cancel</Button>
          <Button variant={destructive ? 'danger-solid' : 'primary'}
            onClick={confirmName ? () => { if (nameMatches) onConfirm(); } : onConfirm}
            disabled={confirmName ? !nameMatches : undefined}
            busy={busy} busyLabel={busyLabel}>
            {confirmLabel}
          </Button>
        </>
      )}
    >
      <div style={{ textAlign: 'center' }}>
        <div style={{ marginBottom: 'var(--space-12)', display: 'flex', justifyContent: 'center' }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: destructive ? 'rgba(239,68,68,0.12)' : 'var(--card2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon size={26} color={destructive ? 'var(--red)' : 'var(--accent)'} />
          </div>
        </div>
        <p style={{ fontSize: 'var(--font-size-13)', color: 'var(--text-muted)', marginBottom: 'var(--space-8)', lineHeight: 1.6 }}>
          {description}
        </p>
        {subject && (
          <p style={{ fontSize: 'var(--font-size-14)', fontWeight: 700, color: 'var(--text)', marginBottom: 'var(--space-4)' }}>
            {subject}
          </p>
        )}
        {role && (
          <span className={`badge ${roleBadge(role)}`} style={{ marginBottom: 'var(--space-12)', display: 'inline-block' }}>
            {roleLabel(role)}
          </span>
        )}
        {details?.length > 0 && (
          <ul style={{ textAlign: 'left', margin: 'var(--space-12) 0 0', paddingLeft: 'var(--space-16)', listStyle: 'disc', fontSize: 'var(--font-size-13)', color: 'var(--text)', lineHeight: 1.6 }}>
            {details.map(item => <li key={item}>{item}</li>)}
          </ul>
        )}
        {counts?.length > 0 && (
          <dl aria-live="polite" style={{ textAlign: 'left', margin: 'var(--space-12) 0 0', fontSize: 'var(--font-size-13)', lineHeight: 1.6 }}>
            {counts.map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-12)' }}>
                <dt style={{ color: 'var(--text-muted)' }}>{label}</dt>
                <dd style={{ color: 'var(--text)', fontWeight: 600, margin: 0 }}>{value}</dd>
              </div>
            ))}
          </dl>
        )}
        {warning && (
          <p style={{ fontSize: 'var(--font-size-12)', color: 'var(--red)', marginTop: 'var(--space-12)', marginBottom: 'var(--space-24)' }}>
            {warning}
          </p>
        )}
        {recommendation && (
          <p style={{ fontSize: 'var(--font-size-12)', color: 'var(--text-muted)', marginTop: 'var(--space-8)', lineHeight: 1.5 }}>
            {recommendation}
          </p>
        )}
        {confirmName && <TypeToConfirm name={confirmName} value={typed} onChange={setTyped} />}
      </div>
    </Modal>
  );
};

export default ConfirmationDialog;
