// Service Worker for Firebase Cloud Messaging & Web Push notifications

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  try {
    const payload = event.data.json();
    const title = payload.notification?.title || 'DrNutrident Notification';
    const options = {
      body: payload.notification?.body || '',
      icon: '/favicon-32x32.png',
      badge: '/favicon-32x32.png',
      data: payload.data || {},
    };
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (err) {
    // If not JSON, handle as plain text
    const text = event.data.text();
    event.waitUntil(
      self.registration.showNotification('DrNutrident', {
        body: text,
        icon: '/favicon-32x32.png',
      })
    );
  }
});

