import { createContext, useCallback, useContext, useMemo, useRef } from 'react';

const ProfileUnsavedChangesContext = createContext({
  registerProfileGuard: () => () => {},
  requestProfileNavigation: (action) => { action(); return true; },
});

export const ProfileUnsavedChangesProvider = ({ children }) => {
  const guardRef = useRef(null);

  const registerProfileGuard = useCallback((guard) => {
    guardRef.current = guard;
    return () => {
      if (guardRef.current === guard) guardRef.current = null;
    };
  }, []);

  const requestProfileNavigation = useCallback((action) => {
    const guard = guardRef.current;
    if (!guard || !guard.shouldBlock()) {
      action();
      return true;
    }
    guard.requestLeave(action);
    return false;
  }, []);

  const value = useMemo(() => ({
    registerProfileGuard,
    requestProfileNavigation,
  }), [registerProfileGuard, requestProfileNavigation]);

  return (
    <ProfileUnsavedChangesContext.Provider value={value}>
      {children}
    </ProfileUnsavedChangesContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useProfileUnsavedChanges = () => useContext(ProfileUnsavedChangesContext);
