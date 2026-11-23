// Aplica el tema guardado antes de pintar el visor, para que no haya destello claro→oscuro.
// La preferencia de verdad está en chrome.storage (viewer.js la sincroniza); esto es solo una copia rápida.
(() => {
  let pref = 'light';
  try { pref = localStorage.getItem('sie-theme') || 'light'; } catch (_) {}
  const dark = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  let style = 'cards';
  try { style = localStorage.getItem('sie-style') || 'cards'; } catch (_) {}
  if (style === 'classic') document.documentElement.dataset.style = 'classic';
})();
