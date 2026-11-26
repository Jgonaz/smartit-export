// Recibe del service worker los archivos de una incidencia y los escribe en la carpeta elegida.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.target !== 'offscreen') return;
  if (msg.type === 'status') {
    (async () => { const h = await SieCarpeta.get(); return { name: h ? h.name : '', status: await SieCarpeta.status(h) }; })()
      .then(sendResponse, () => sendResponse({ name: '', status: 'none' }));
    return true;
  }
  if (msg.type === 'tags-info') {
    (async () => {
      const h = await SieCarpeta.get();
      if (!h || (await SieCarpeta.status(h)) !== 'granted') return { ok: false };
      return { ok: true, ...(await SieCarpeta.tagsInfo(h, msg.folder)) };
    })().then(sendResponse, () => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === 'related') {
    (async () => {
      const h = await SieCarpeta.get();
      if (!h) return { ok: false, reason: 'no-folder' };
      if ((await SieCarpeta.status(h)) !== 'granted') return { ok: false, reason: 'permission' };
      const items = await SieCarpeta.related(h, msg.current || {});
      return { ok: true, items, total: SieCarpeta.related.total || 0, more: SieCarpeta.related.more || 0 };
    })().then(sendResponse, () => sendResponse({ ok: false }));
    return true;
  }
  if (msg.type === 'load-saved') {
    (async () => {
      const h = await SieCarpeta.get();
      if (!h) return { ok: false, reason: 'no-folder' };
      if ((await SieCarpeta.status(h)) !== 'granted') return { ok: false, reason: 'permission' };
      const data = await SieCarpeta.loadSaved(h, msg.folder);
      return data ? { ok: true, data } : { ok: false, reason: 'not-found' };
    })().then(sendResponse, err => sendResponse({ ok: false, reason: 'error', error: String(err && err.message || err) }));
    return true;
  }
  if (msg.type === 'tags-update') {
    (async () => {
      const h = await SieCarpeta.get();
      if (!h) return { ok: false, reason: 'no-folder' };
      if ((await SieCarpeta.status(h)) !== 'granted') return { ok: false, reason: 'permission', folderName: h.name };
      return { ok: true, ...(await SieCarpeta.updateTags(h, msg.folder, { add: msg.add, remove: msg.remove })) };
    })().then(sendResponse, err => sendResponse({ ok: false, reason: 'error', error: String(err && err.message || err) }));
    return true;
  }
  if (msg.type !== 'write') return;
  (async () => {
    const handle = await SieCarpeta.get();
    if (!handle) return { ok: false, reason: 'no-folder' };
    const st = await SieCarpeta.status(handle);
    if (st !== 'granted') return { ok: false, reason: 'permission', folderName: handle.name };
    const r = await SieCarpeta.write(handle, msg.folder, msg.files, msg.meta);
    return { ok: true, ...r };
  })().then(sendResponse, err => sendResponse({ ok: false, reason: 'error', error: String(err && err.message || err) }));
  return true;
});
