(() => {
  const report = (message) => {
    const fallback = document.querySelector('.casino-starting');
    if (!fallback) return;
    fallback.className = 'casino-load-error';
    fallback.setAttribute('role', 'alert');
    fallback.textContent = message;
  };

  window.addEventListener('error', (event) => {
    const source = event.target instanceof HTMLScriptElement ? event.target.src : event.filename;
    if (source && source.includes('/casino-dist/casino-app.js')) {
      console.error('Casino bundle failed to load or execute.', event.message || source);
      report(`Casino failed to start: ${event.message || 'bundle could not be loaded'}`);
    }
  }, true);
})();
