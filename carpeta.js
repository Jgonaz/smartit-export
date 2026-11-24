// Carpeta donde se guardan las incidencias (API de acceso a archivos de Chrome).
// La referencia a la carpeta se guarda en IndexedDB de la extensión: Chrome no da la ruta,
// solo un "handle" que permite escribir dentro si el usuario ha dado permiso.
// Lo usan options.html (para elegir la carpeta y dar permiso) y offscreen.html (para escribir sin ventanas).
const SieCarpeta = (() => {
  const DB = 'sie-carpeta', STORE = 'handles', KEY = 'dir';
  const open = () => new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  async function tx(mode, fn) {
    const db = await open();
    try {
      return await new Promise((res, rej) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        t.oncomplete = () => res(req && req.result);
        t.onerror = () => rej(t.error);
      });
    } finally { db.close(); }
  }
  const get = () => tx('readonly', s => s.get(KEY));
  const set = handle => tx('readwrite', s => s.put(handle, KEY));
  const clear = () => tx('readwrite', s => s.delete(KEY));

  // 'granted' | 'prompt' | 'denied' | 'none' (sin carpeta)
  async function status(handle) {
    handle = handle || await get();
    if (!handle) return 'none';
    try { return await handle.queryPermission({ mode: 'readwrite' }); } catch (_) { return 'prompt'; }
  }

  const safe = n => String(n).normalize('NFC').replace(/[\\/:*?"<>|]+/g, '_').replace(/^\.+/, '_').trim() || 'archivo';

  // files: [{ path: 'incidencia.md', text } | { path: 'adjuntos/x.png', dataUrl }]
  // Al volver a guardar: incidencia.md se reescribe y adjuntos/ se rehace para que coincida con la
  // incidencia actual. El resto de lo que haya en la carpeta (notas del agente, etc.) no se toca.
  async function write(handle, folder, files) {
    const base = await handle.getDirectoryHandle(safe(folder), { create: true });
    try { await base.removeEntry('adjuntos', { recursive: true }); } catch (_) { /* no existía */ }
    for (const f of files) {
      const parts = f.path.split('/').map(safe);
      let dir = base;
      for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p, { create: true });
      const fh = await dir.getFileHandle(parts[parts.length - 1], { create: true });
      const w = await fh.createWritable();
      try {
        if (f.dataUrl) await w.write(await (await fetch(f.dataUrl)).blob());
        else await w.write(new Blob([f.text || ''], { type: 'text/markdown' }));
      } finally { await w.close(); }
    }
    return { folderName: handle.name, folder: safe(folder) };
  }

  // Prompt que se copia al guardar, para pegarlo en el agente (Copilot CLI, etc.).
  function prompt({ agentPath, folderName, folder, number, summary }) {
    const base = (agentPath || '').trim().replace(/[\\/]+$/, '');
    const sep = base.includes('\\') && !base.includes('/') ? '\\' : '/';
    const dir = base ? base + sep + folder : `${folderName || 'la carpeta elegida'}${sep}${folder}`;
    const title = [number, summary].filter(Boolean).join(' – ');
    return `Analiza la incidencia ${title || folder}. Toda la información está en ${dir}${sep}incidencia.md ` +
      `y sus adjuntos en ${dir}${sep}adjuntos${sep} (si los hay). Revisa también las imágenes.`;
  }

  return { get, set, clear, status, write, safe, prompt };
})();
