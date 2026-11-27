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

// force: «Comprobar ahora» desde los ajustes (aunque la comprobación automática esté desactivada).
async function updateInfo(force) {
  const installed = chrome.runtime.getManifest().version;
  let { updateCheck = {}, updateDismissed = '', autoUpdateCheck = true } = await chrome.storage.local.get(['updateCheck', 'updateDismissed', 'autoUpdateCheck']);
  // Comprobación automática desactivada: no se consulta GitHub ni se muestran avisos.
  if (!autoUpdateCheck && !force) return { installed, remote: '', available: false, dismissed: false, disabled: true, repo: `https://github.com/${REPO}` };
  let failed = false;
  if (force || !updateCheck.checkedAt || Date.now() - updateCheck.checkedAt > DAY) {
    try {
      const r = await fetch(REMOTE_MANIFEST, { cache: 'no-store' });
      if (r.ok) {
        const m = await r.json();
        updateCheck = { checkedAt: Date.now(), remote: String(m.version || '') };
      } else {
        failed = true;
        updateCheck = { checkedAt: Date.now(), remote: updateCheck.remote || '' };
      }
    } catch (_) {
      failed = true;
      // Sin conexión: se reintenta en la próxima consulta, sin guardar la fecha.
    }
    if (updateCheck.checkedAt) await chrome.storage.local.set({ updateCheck });
  }
  const remote = updateCheck.remote || '';
  const available = !!remote && newer(remote, installed);
  return { installed, remote, available, failed: force && failed, checkedAt: updateCheck.checkedAt || 0, dismissed: available && updateDismissed === remote, repo: `https://github.com/${REPO}` };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'update-info') {
    updateInfo(!!msg.force).then(sendResponse).catch(() => sendResponse(null));
    return true;
  }
  if (msg && msg.type === 'update-dismiss') {
    chrome.storage.local.set({ updateDismissed: String(msg.version || '') }).then(() => sendResponse({ ok: true }));
    return true;
  }
});

// ---------- guardar en la carpeta elegida ----------
// La escritura la hace un documento oculto de la extensión (offscreen.html), porque el visor
// incrustado en SmartIT es un marco dentro de otra web y ahí Chrome no deja usar la carpeta.
async function ensureOffscreen() {
  const ctx = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  if (ctx.length) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['BLOBS'],
    justification: 'Escribir la incidencia y sus adjuntos en la carpeta elegida por el usuario.'
  });
}

// Ventana de elegir carpeta: todo el alto de la ventana de SmartIT, centrada.
async function openFolderWindow(url, sender) {
  const W = 780;
  let geo = {};
  try {
    const win = sender && sender.tab ? await chrome.windows.get(sender.tab.windowId) : await chrome.windows.getLastFocused();
    if (win && win.state !== 'minimized' && win.height) {
      geo = { top: win.top, height: win.height, left: Math.max(win.left, Math.round(win.left + (win.width - W) / 2)) };
    }
  } catch (_) { /* sin datos de la ventana: tamaño por defecto */ }
  return chrome.windows.create({ url, type: 'popup', width: W, height: geo.height || 900, top: geo.top, left: geo.left, focused: true });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;
  if (msg.type === 'save-files') {
    (async () => {
      await ensureOffscreen();
      return chrome.runtime.sendMessage({ target: 'offscreen', type: 'write', folder: msg.folder, files: msg.files, meta: msg.meta });
    })().then(sendResponse, err => sendResponse({ ok: false, reason: 'error', error: String(err && err.message || err) }));
    return true;
  }
  if (msg.type === 'remove-saved' || msg.type === 'saved-files') {
    ensureOffscreen().then(() => chrome.runtime.sendMessage({ target: 'offscreen', type: msg.type, folder: msg.folder }))
      .then(sendResponse, err => sendResponse({ ok: false, reason: 'error', error: String(err && err.message || err) }));
    return true;
  }
  if (msg.type === 'load-saved') {
    ensureOffscreen().then(() => chrome.runtime.sendMessage({ target: 'offscreen', type: 'load-saved', folder: msg.folder }))
      .then(sendResponse, err => sendResponse({ ok: false, reason: 'error', error: String(err && err.message || err) }));
    return true;
  }
  if (msg.type === 'tags-update') {
    ensureOffscreen().then(() => chrome.runtime.sendMessage({ target: 'offscreen', type: 'tags-update', folder: msg.folder, add: msg.add, remove: msg.remove }))
      .then(sendResponse, err => sendResponse({ ok: false, reason: 'error', error: String(err && err.message || err) }));
    return true;
  }
  if (msg.type === 'related') {
    ensureOffscreen().then(() => chrome.runtime.sendMessage({ target: 'offscreen', type: 'related', current: msg.current }))
      .then(sendResponse, () => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === 'tags-info') {
    ensureOffscreen().then(() => chrome.runtime.sendMessage({ target: 'offscreen', type: 'tags-info', folder: msg.folder }))
      .then(sendResponse, () => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === 'open-folder-view') {
    chrome.tabs.create({ url: chrome.runtime.getURL('explorar.html') }).then(() => sendResponse({ ok: true }), () => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === 'folder-status') {
    ensureOffscreen().then(() => chrome.runtime.sendMessage({ target: 'offscreen', type: 'status' }))
      .then(sendResponse, () => sendResponse({ name: '', status: 'none' }));
    return true;
  }
  if (msg.type === 'open-options') {
    // Ventana pequeña para elegir la carpeta o dar permiso (el selector de Chrome no se abre dentro de SmartIT).
    const url = chrome.runtime.getURL('options.html') + (msg.setup ? '?setup=1' : '');
    (msg.setup ? openFolderWindow(url, sender) : chrome.runtime.openOptionsPage()).then(() => sendResponse({ ok: true }), err => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
});
