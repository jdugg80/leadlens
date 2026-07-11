import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { storageBridge } from '../utils/storage';

const PROCESSING_STORAGE_KEY = '@leadlens_processing_state';

const ProcessingContext = createContext(null);

export function ProcessingProvider({ children }) {
  // Initialize from MMKV so backgrounded app restores lock on relaunch
  const [isProcessing, setIsProcessing] = useState(() => {
    try {
      const stored = storageBridge.getSync(PROCESSING_STORAGE_KEY);
      return stored === 'true';
    } catch {
      return false;
    }
  });

  const [processingMessage, setProcessingMessage] = useState('');
  const timeoutRef = useRef(null);

  // Persist to MMKV on every change so backgrounding mid-processing is safe
  useEffect(() => {
    try {
      storageBridge.setSync(PROCESSING_STORAGE_KEY, isProcessing ? 'true' : 'false');
    } catch (err) {
      console.warn('[ProcessingContext] Failed to persist state:', err?.message || err);
    }
  }, [isProcessing]);

  // Safety net: auto-clear after 60s to prevent permanent lock
  useEffect(() => {
    if (isProcessing) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        console.warn('[ProcessingContext] Auto-clearing stale processing lock after 60s');
        setIsProcessing(false);
        setProcessingMessage('');
      }, 60000);
    }
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isProcessing]);

  const startProcessing = useCallback((message = 'Processing...') => {
    console.log('[ProcessingContext] Lock acquired:', message);
    setProcessingMessage(message);
    setIsProcessing(true);
  }, []);

  const updateMessage = useCallback((message) => {
    setProcessingMessage(message);
  }, []);

  const stopProcessing = useCallback(() => {
    console.log('[ProcessingContext] Lock released');
    setIsProcessing(false);
    setProcessingMessage('');
  }, []);

  const value = useMemo(
    () => ({ isProcessing, processingMessage, startProcessing, updateMessage, stopProcessing }),
    [isProcessing, processingMessage, startProcessing, updateMessage, stopProcessing]
  );

  return (
    <ProcessingContext.Provider value={value}>
      {children}
    </ProcessingContext.Provider>
  );
}

export function useProcessing() {
  const ctx = useContext(ProcessingContext);
  if (!ctx) {
    throw new Error('useProcessing must be used within a ProcessingProvider');
  }
  return ctx;
}

// Imperative API for non-hook contexts (e.g., utility files)
const imperativeRef = { current: null };

export function setProcessing(message = 'Processing...') {
  imperativeRef.current?.startProcessing?.(message);
}

export function clearProcessing() {
  imperativeRef.current?.stopProcessing?.();
}

export { imperativeRef };
