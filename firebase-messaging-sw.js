importScripts("https://www.gstatic.com/firebasejs/11.6.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/11.6.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyAmPIQMfAR1BmvJbjx3L002ibVu2kXA3uM",
  authDomain: "schedule-app-5845b.firebaseapp.com",
  projectId: "schedule-app-5845b",
  storageBucket: "schedule-app-5845b.firebasestorage.app",
  messagingSenderId: "1046564647922",
  appId: "1:1046564647922:web:965bb01618c8b6b992b16b"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function (payload) {
  const title = payload?.notification?.title || "新通知";
  const body = payload?.notification?.body || "";
  const link = payload?.data?.link || payload?.fcmOptions?.link || "https://schedule-app-5845b.web.app/#announcement";

  self.registration.showNotification(title, {
    body,
    data: {
      link
    }
  });
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const targetLink = event.notification.data?.link || "https://schedule-app-5845b.web.app/#announcement";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientList) {
      for (const client of clientList) {
        if (client.url === targetLink && "focus" in client) {
          return client.focus();
        }
      }

      if (clients.openWindow) {
        return clients.openWindow(targetLink);
      }

      return undefined;
    })
  );
});
