// Loaded into the app's service worker (vite.config.js, workbox.importScripts).
// Daily reminders arrive as payload-less pushes from the sync server, so the
// wording is here, on the device.
self.addEventListener('push', (event) => {
  event.waitUntil(
    self.registration.showNotification('Weather Journal', {
      body: 'How was today? Take a minute to write it down.',
      icon: 'icons/icon.svg',
      badge: 'icons/icon.svg',
      tag: 'daily-reminder',
      data: { url: './#/new' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || './', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.startsWith(self.registration.scope));
      if (open) {
        open.navigate(url);
        return open.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
