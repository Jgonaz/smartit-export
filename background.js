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

// ---------- aviso de versión nueva ----------
// Como mucho una vez al día descarga el manifest.json público del repo y compara versiones.
// No envía nada: es una simple descarga de ese archivo.
const REPO = 'Jgonaz/smartit-export';
const REMOTE_MANIFEST = `https://raw.githubusercontent.com/${REPO}/main/manifest.json`;
const DAY = 24 * 60 * 60 * 1000;

const newer = (a, b) => { // ¿a > b? (versiones tipo 1.2.3)
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
};

async function updateInfo() {
  const installed = chrome.runtime.getManifest().version;
  let { updateCheck = {}, updateDismissed = '' } = await chrome.storage.local.get(['updateCheck', 'updateDismissed']);
  if (!updateCheck.checkedAt || Date.now() - updateCheck.checkedAt > DAY) {
    try {
      const r = await fetch(REMOTE_MANIFEST, { cache: 'no-store' });
      if (r.ok) {
        const m = await r.json();
        updateCheck = { checkedAt: Date.now(), remote: String(m.version || '') };
      } else {
        updateCheck = { checkedAt: Date.now(), remote: updateCheck.remote || '' };
      }
    } catch (_) {
      // Sin conexión: se reintenta en la próxima consulta, sin guardar la fecha.
    }
    if (updateCheck.checkedAt) await chrome.storage.local.set({ updateCheck });
  }
  const remote = updateCheck.remote || '';
  const available = !!remote && newer(remote, installed);
  return { installed, remote, available, dismissed: available && updateDismissed === remote, repo: `https://github.com/${REPO}` };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'update-info') {
    updateInfo().then(sendResponse).catch(() => sendResponse(null));
    return true;
  }
  if (msg && msg.type === 'update-dismiss') {
    chrome.storage.local.set({ updateDismissed: String(msg.version || '') }).then(() => sendResponse({ ok: true }));
    return true;
  }
});
