import { Fragment, createElement, useCallback, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { UNSAFE_DataRouterContext, useBlocker } from 'react-router-dom';
import { ConfirmDialog } from '../shared/ui';

const RouteBlocker = ({ onBlocked }) => {
  const blocker = useBlocker(true);

  useEffect(() => {
    if (blocker.state === 'blocked') onBlocked(blocker);
  }, [blocker, onBlocked]);

  return null;
};

// Scoped to one open worksheet dialog; no shared application-wide guard.
export default function useDialogSafety({ dirty, pending, onClose, discardMessage, leaveMessage }) {
  const dataRouter = useContext(UNSAFE_DataRouterContext);
  const [busyNotice, setBusyNotice] = useState(false);
  const [confirmation, setConfirmation] = useState(null);

  const requestClose = useCallback((action) => {
    if (pending) {
      setBusyNotice(true);
      return false;
    }
    if (dirty) {
      setConfirmation({
        message: discardMessage || 'Discard unsaved changes?',
        confirmLabel: 'Discard changes',
        action: typeof action === 'function' ? action : onClose,
      });
      return false;
    }
    (typeof action === 'function' ? action : onClose)();
    return true;
  }, [dirty, pending, discardMessage, onClose]);

  const onBlocked = useCallback((blocker) => {
    if (confirmation) return;
    if (pending) {
      setBusyNotice(true);
      blocker.reset();
      return;
    }
    if (dirty) {
      setConfirmation({
        message: leaveMessage || discardMessage || 'Discard unsaved changes?',
        confirmLabel: 'Leave page',
        action: () => blocker.proceed(),
        cancel: () => blocker.reset(),
      });
      return;
    }
    blocker.proceed();
  }, [dirty, pending, discardMessage, leaveMessage, confirmation]);

  const cancelConfirmation = useCallback(() => {
    confirmation?.cancel?.();
    setConfirmation(null);
  }, [confirmation]);
  const acceptConfirmation = useCallback(() => {
    const action = confirmation?.action;
    setConfirmation(null);
    action?.();
  }, [confirmation]);

  useEffect(() => {
    if (!dirty && !pending) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, pending]);

  return {
    requestClose,
    routeBlocker: createElement(Fragment, null,
      dataRouter && (dirty || pending) ? createElement(RouteBlocker, { onBlocked }) : null,
      confirmation && typeof document !== 'undefined' ? createPortal(createElement(ConfirmDialog, {
        title: 'Unsaved changes', message: confirmation.message, confirmLabel: confirmation.confirmLabel,
        onCancel: cancelConfirmation, onConfirm: acceptConfirmation,
      }), document.body) : null),
    busyNotice: busyNotice && pending ? 'Please wait for the current save to finish before leaving.' : '',
  };
}
