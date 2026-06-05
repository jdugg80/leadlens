// LeadLens Admin - Service Worker
self.addEventListener('push', (event) => {
  if (!event.data) return;
  const data = event.data.json();
  const options = {
    body: data.body || 'New submission received',
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag: data.tag || 'leadlens',
    renotify: true,
    requireInteraction: data.priority === 'critical',
    data: { url: data.url || '/roadmap' },
    actions: [
      { action: 'view', title: 'View Now' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };
  event.waitUntil(
    self.registration.showNotification(data.title || 'LeadLens Admin', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const url = event.notification.data?.url || '/roadmap';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes('leadlens') && 'focus' in client) {
          client.navigate('https://leadlens-flame.vercel.app' + url);
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow('https://leadlens-flame.vercel.app' + url);
    })
  );
});

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(clients.claim()));
