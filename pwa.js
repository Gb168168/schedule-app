if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('/sw.js');
      console.info('[PWA] Service Worker registered.');
    } catch (error) {
      console.warn('[PWA] Service Worker registration failed:', error);
    }
  });
}
