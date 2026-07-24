/*
 * Firebase Cloud Messaging background service worker.
 *
 * This is SEPARATE from the vite-plugin-pwa (Workbox) app-shell worker: it's
 * registered from `src/firebase/messaging.ts` at its own scope
 * (`/firebase-cloud-messaging-push-scope`) so the two never fight over the
 * root scope. Its only job is to show a notification for a "ping" that arrives
 * while the app isn't in the foreground.
 *
 * A service worker can't read Vite env vars, so the client passes the Firebase
 * config through this file's registration URL as query params; we read them
 * back off `location.search` below.
 *
 * Pings are sent as DATA-ONLY messages (no `notification` payload) so the
 * browser doesn't auto-display one AND fire `onBackgroundMessage` — we build
 * the single notification here, in full control of icon/tag/click behaviour.
 */
/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/12.16.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.16.0/firebase-messaging-compat.js');

const params = new URL(self.location).searchParams;
const firebaseConfig = {
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  storageBucket: params.get('storageBucket'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
};

if (firebaseConfig.projectId) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const data = payload.data || {};
    const title = data.title || 'Listpad';
    self.registration.showNotification(title, {
      body: data.body || 'Someone pinged your list',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      // Collapse repeated pings for the same workspace into one notification.
      tag: data.workspaceId ? `ping-${data.workspaceId}` : 'ping',
      renotify: true,
      data: { link: data.link || '/' },
    });
  });
}

// Focus an existing tab if the app is already open; otherwise open one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(link);
      return undefined;
    }),
  );
});
