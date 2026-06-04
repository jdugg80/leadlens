import { useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';

type LeadLockGps = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  timestamp: string | number;
} | null;

export default function useLeadLockLocationSnapshot(active: boolean = true) {
  const [locationPermissionStatus, setLocationPermissionStatus] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const lastKnownLocation = useRef<Location.LocationObject | null>(null);
  const [leadLockGps, setLeadLockGps] = useState<LeadLockGps>(null);
  const watcherRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    let mounted = true;

    async function startWatcher() {
      try {
        console.log('[LeadLock Location] requesting foreground permission');
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (!mounted) return;
        setLocationPermissionStatus(status);
        console.log('[LeadLock Location] permission status:', status);
        if (status !== 'granted') {
          setLocationError('permission-denied');
          return;
        }

        // Try immediate last known position first
        try {
          const last = await Location.getLastKnownPositionAsync();
          if (last) {
            lastKnownLocation.current = last;
            setLeadLockGps({
              latitude: last.coords.latitude,
              longitude: last.coords.longitude,
              accuracy: last.coords.accuracy ?? null,
              timestamp: last.timestamp ?? Date.now(),
            });
            console.log('[LeadLock Location] last known location available, accuracy:', last.coords.accuracy);
          }
        } catch (e) {
          console.warn('[LeadLock Location] getLastKnownPositionAsync failed', e);
        }

        console.log('[LeadLock Location] starting watchPositionAsync');
        watcherRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 3000,
            distanceInterval: 5,
            mayShowUserSettingsDialog: false,
          },
          (pos) => {
            lastKnownLocation.current = pos;
            const gps = {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy ?? null,
              timestamp: pos.timestamp ?? Date.now(),
            };
            setLeadLockGps(gps);
            console.log('[LeadLock Location] update — accuracy:', gps.accuracy);
          }
        );
        console.log('[LeadLock Location] watcher started');
      } catch (err: any) {
        console.error('[LeadLock Location] watcher start failed', err);
        setLocationError(err?.message || 'watcher-failed');
      }
    }

    if (active) startWatcher();

    return () => {
      mounted = false;
      if (watcherRef.current) {
        console.log('[LeadLock Location] stopping watcher');
        watcherRef.current.remove();
        watcherRef.current = null;
      }
    };
  }, [active]);

  return {
    lastKnownLocation: lastKnownLocation.current,
    leadLockGps,
    locationPermissionStatus,
    locationError,
  };
}
