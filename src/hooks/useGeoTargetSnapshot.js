import { useCallback, useState } from 'react';
import { createGeoTargetSnapshot } from '../utils/geoTargetLocation';

export function useGeoTargetSnapshot(defaultOptions = {}) {
  const [geoTarget, setGeoTarget] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const captureGeoTarget = useCallback(async (options = {}) => {
    setLoading(true);
    setError(null);

    try {
      const snapshot = await createGeoTargetSnapshot({
        ...defaultOptions,
        ...options,
      });

      setGeoTarget(snapshot);
      return snapshot;
    } catch (err) {
      setError(err?.message || String(err));
      throw err;
    } finally {
      setLoading(false);
    }
  }, [defaultOptions]);

  return {
    geoTarget,
    loading,
    error,
    captureGeoTarget,
    setGeoTarget,
  };
}
