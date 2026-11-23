// Recibe los datos recogidos en la ficha, los guarda en local y abre el visor
// (en una pestaña nueva, o devuelve el id para mostrarlo dentro de SmartIT).
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'open-viewer') {
    // Id imposible de adivinar: el visor solo muestra la exportación cuyo id conoce.
    const id = 'exp_' + Date.now() + '_' + crypto.randomUUID();
    chrome.storage.local.set({ [id]: msg.data }).then(async () => {
      await cleanupOld();
      if (!msg.inline) {
        await chrome.tabs.create({
          url: chrome.runtime.getURL('viewer.html') + '#' + id,
          index: sender.tab ? sender.tab.index + 1 : undefined
        });
      }
      sendResponse({ ok: true, id });
    }).catch(err => sendResponse({ ok: false, error: String(err) }));
    return true; // respuesta asíncrona
  }
});

// Conserva solo las 10 exportaciones más recientes.
async function cleanupOld() {
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter(k => k.startsWith('exp_')).sort();
  const old = keys.slice(0, Math.max(0, keys.length - 10));
  if (old.length) await chrome.storage.local.remove(old);
}
