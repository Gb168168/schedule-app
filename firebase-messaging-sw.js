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

  self.registration.showNotification(title, {
    body
  });
});
