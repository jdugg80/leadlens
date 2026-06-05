// src/hooks/usePushNotifications.js
// Handles service worker registration and push subscription

const VAPID_PUBLIC_KEY = 'BJuv9Pf5X4PPM6fwosFB7OcUXOiV7XayE0N1T_hR-paY7mPijE-XaiKGa9nop5V2-zElWNHjWSASm-nmiinARfQ';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export async function registerPush(supabase, userEmail) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Push not supported');
    return false;
  }

  try {
    // Register service worker
    const reg = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    // Request permission
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    // Subscribe
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    // Save to Supabase
    const { error } = await supabase.from('push_subscriptions').upsert({
      email: userEmail,
      subscription: JSON.stringify(subscription),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'email' });

    if (error) throw error;
    console.log('Push subscription saved');
    return true;
  } catch (e) {
    console.error('Push registration failed:', e);
    return false;
  }
}

export async function unregisterPush(supabase, userEmail) {
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    if (reg) {
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
    }
    await supabase.from('push_subscriptions').delete().eq('email', userEmail);
    return true;
  } catch (e) {
    console.error('Unregister failed:', e);
    return false;
  }
}

export async function isPushEnabled() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    if (!reg) return false;
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch {
    return false;
  }
}
