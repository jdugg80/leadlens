import { useState, useCallback } from 'react';

/**
 * useThemedToast
 *
 * Returns:
 *   toastProps  – spread onto <ThemedToast {...toastProps} />
 *   showToast   – (message: string, variant: 'success' | 'error') => void
 *   hideToast   – () => void
 *
 * Usage:
 *   const { toastProps, showToast } = useThemedToast();
 *   // In JSX (inside a relative/absolute positioned root view):
 *   <ThemedToast {...toastProps} />
 *   // To trigger:
 *   showToast('Message sent!', 'success');
 *   showToast('Something went wrong.', 'error');
 */
export default function useThemedToast() {
  const [toastState, setToastState] = useState({
    visible: false,
    message: '',
    variant: 'success',
  });

  const showToast = useCallback((message, variant = 'success') => {
    // If a toast is already visible, hide it first then show the new one
    setToastState({ visible: false, message: '', variant });
    // Small tick to allow React to re-render before showing again
    setTimeout(() => {
      setToastState({ visible: true, message, variant });
    }, 50);
  }, []);

  const hideToast = useCallback(() => {
    setToastState((prev) => ({ ...prev, visible: false }));
  }, []);

  const toastProps = {
    visible: toastState.visible,
    message: toastState.message,
    variant: toastState.variant,
    onDismiss: hideToast,
  };

  return { toastProps, showToast, hideToast };
}
