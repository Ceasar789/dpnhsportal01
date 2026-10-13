import { createContext, useCallback, useContext, useMemo, useRef } from 'react';

const TeachingLoadUnsavedChangesContext = createContext({
  registerTeachingLoadGuard: () => () => {},
  requestTeachingLoadNavigation: (action) => { action(); return true; },
});

export const TeachingLoadUnsavedChangesProvider = ({ children }) => {
  const guardRef = useRef(null);

  const registerTeachingLoadGuard = useCallback((guard) => {
    guardRef.current = guard;
    return () => {
      if (guardRef.current === guard) guardRef.current = null;
    };
  }, []);

  const requestTeachingLoadNavigation = useCallback((action, destination = '') => {
    const guard = guardRef.current;
    if (!guard || !guard.shouldBlock()) {
      action();
      return true;
    }
    guard.requestLeave(action, destination);
    return false;
  }, []);

  const value = useMemo(() => ({
    registerTeachingLoadGuard,
    requestTeachingLoadNavigation,
  }), [registerTeachingLoadGuard, requestTeachingLoadNavigation]);

  return (
    <TeachingLoadUnsavedChangesContext.Provider value={value}>
      {children}
    </TeachingLoadUnsavedChangesContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useTeachingLoadUnsavedChanges = () => useContext(TeachingLoadUnsavedChangesContext);
