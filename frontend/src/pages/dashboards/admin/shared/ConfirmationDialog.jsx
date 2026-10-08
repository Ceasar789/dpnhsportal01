import { AlertTriangle, LogOut } from 'lucide-react';
import Modal from '../../../../components/ui/Modal';
import Button from '../../../../components/ui/Button';
import { roleBadge, roleLabel } from './helpers';

const ConfirmationDialog = ({
  open,
  title,
  description,
  subject,
  role,
  warning,
  confirmLabel,
  destructive = false,
  onCancel,
  onConfirm,
}) => {
  const Icon = destructive ? AlertTriangle : LogOut;

  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={(requestClose) => (
        <>
          <Button variant="ghost" onClick={requestClose}>Cancel</Button>
          <Button variant={destructive ? 'danger-solid' : 'primary'} onClick={onConfirm}>
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
        {warning && (
          <p style={{ fontSize: 'var(--font-size-12)', color: 'var(--red)', marginTop: 'var(--space-12)', marginBottom: 'var(--space-24)' }}>
            {warning}
          </p>
        )}
      </div>
    </Modal>
  );
};

export default ConfirmationDialog;
