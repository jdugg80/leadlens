import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import ThemedToast from '../components/ThemedToast';

const ToastContext = createContext(null);

const imperativeRef = { current: null };

export function ToastProvider({ children }) {
  const [toast, setToast] = useState({
    visible: false,
    message: '',
    type: 'success',
  });

  const showToast = useCallback((message, type = 'success') => {
    setToast({ visible: true, message, type });
  }, []);

  const hideToast = useCallback(() => {
    setToast((prev) => ({ ...prev, visible: false }));
  }, []);

  const value = useMemo(
    () => ({ toast, showToast, hideToast }),
    [toast, showToast, hideToast]
  );

  useEffect(() => {
    imperativeRef.current = { showToast, hideToast };
    return () => {
      imperativeRef.current = null;
    };
  }, [showToast, hideToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ThemedToast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onDismiss={hideToast}
      />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
}

export function showToast(message, type = 'success') {
  imperativeRef.current?.showToast?.(message, type);
}

export function hideToast() {
  imperativeRef.current?.hideToast?.();
}

export { imperativeRef };
