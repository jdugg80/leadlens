import React, { createContext, useContext, useState, useCallback, useMemo, useRef } from 'react';

// Tracks whether any full-screen/bottom-sheet modal is currently open, anywhere
// in the app. The BetaFeedbackFAB is rendered globally in App.js and has no way
// to know a screen-local modal (a bottom sheet, a details card, etc.) has opened
// on top of it -- trying to give it a "protected zone" for every possible modal
// across the whole app doesn't scale. Instead, any screen that opens a modal
// calls openModal()/closeModal() and the FAB just hides itself while count > 0.
//
// Uses a counter rather than a boolean so two modals opening/closing in an
// unpredictable order (e.g. one modal triggers another) don't stomp on each
// other -- the FAB only reappears once every opener has closed.
const ModalVisibilityContext = createContext(null);

export function ModalVisibilityProvider({ children }) {
  const [openCount, setOpenCount] = useState(0);
  const safetyTimers = useRef(new Set());

  const openModal = useCallback(() => {
    setOpenCount((prev) => prev + 1);
    // Safety net: a screen that unmounts without calling closeModal (fast nav
    // away, a crash mid-modal) would otherwise leave the FAB hidden forever.
    const timer = setTimeout(() => {
      setOpenCount((prev) => Math.max(0, prev - 1));
      safetyTimers.current.delete(timer);
    }, 5 * 60 * 1000);
    safetyTimers.current.add(timer);
    return () => {
      clearTimeout(timer);
      safetyTimers.current.delete(timer);
    };
  }, []);

  const closeModal = useCallback((cancelSafetyTimer) => {
    setOpenCount((prev) => Math.max(0, prev - 1));
    cancelSafetyTimer?.();
  }, []);

  const value = useMemo(
    () => ({ isModalOpen: openCount > 0, openModal, closeModal }),
    [openCount, openModal, closeModal]
  );

  return (
    <ModalVisibilityContext.Provider value={value}>
      {children}
    </ModalVisibilityContext.Provider>
  );
}

export function useModalVisibility() {
  const ctx = useContext(ModalVisibilityContext);
  if (!ctx) {
    throw new Error('useModalVisibility must be used within a ModalVisibilityProvider');
  }
  return ctx;
}
