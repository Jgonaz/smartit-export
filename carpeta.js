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
  // ---------- bloque de datos (frontmatter YAML sencillo) ----------
  // Solo lo necesario: claves simples, textos y listas [a, b]. Lo entiende cualquier agente o editor.
  const FM = {
    parse(text) {
      const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text || '');
      if (!m) return { data: {}, body: text || '' };
      const data = {};
      m[1].split(/\r?\n/).forEach(line => {
        const kv = /^([A-Za-z0-9_áéíóúñ-]+):\s*(.*)$/.exec(line);
        if (!kv) return;
        let v = kv[2].trim();
        if (/^\[.*\]$/.test(v)) v = v.slice(1, -1).split(',').map(x => FM.unq(x.trim())).filter(Boolean);
        else v = FM.unq(v);
        data[kv[1]] = v;
      });
      return { data, body: text.slice(m[0].length) };
    },
    unq(v) {
      if (/^".*"$/.test(v)) { try { return JSON.parse(v); } catch (_) { return v.slice(1, -1); } }
      if (/^'.*'$/.test(v)) return v.slice(1, -1).replace(/''/g, "'");
      return v;
    },
    q(v) {
      v = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
      return /^[\p{L}\p{N}][\p{L}\p{N} ._/()>áéíóúñ-]*$/u.test(v) && !/^(true|false|null|yes|no)$/i.test(v) && !/: /.test(v) ? v : JSON.stringify(v);
    },
    // keepEmpty: escribe también las claves vacías ("causa:"), para que se vea qué hay que rellenar.
    stringify(data, keepEmpty) {
      const lines = Object.entries(data)
        .filter(([, v]) => keepEmpty || (v != null && v !== ''))
        .map(([k, v]) => Array.isArray(v) ? `${k}: [${v.map(FM.q).join(', ')}]` : (v == null || v === '' ? `${k}:` : `${k}: ${FM.q(v)}`));
      return `---\n${lines.join('\n')}\n---\n`;
    }
  };

  // Etiqueta normalizada: minúsculas, sin espacios ("Correo no llega" -> "correo-no-llega").
  const normTag = t => String(t || '').toLowerCase().normalize('NFC').trim()
    .replace(/[\s_]+/g, '-').replace(/[^\p{L}\p{N}-]+/gu, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const uniqTags = list => [...new Set((list || []).map(normTag).filter(Boolean))];

  async function readText(dir, name) {
    try { return await (await (await dir.getFileHandle(name)).getFile()).text(); } catch (_) { return null; }
  }
  async function writeText(dir, name, text) {
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    try { await w.write(new Blob([text], { type: 'text/markdown' })); } finally { await w.close(); }
  }

  // ---------- archivos de la raíz de la carpeta ----------
  const TAGS_HEAD = '# Vocabulario de etiquetas\n\nUna línea por etiqueta: `- etiqueta: qué significa`. Úsalas siempre igual (minúsculas y guiones) para que las búsquedas encuentren las incidencias parecidas.\n\n';


  const vocabFrom = text => {
    const out = new Map();
    (text || '').split(/\r?\n/).forEach(l => {
      const m = /^\s*[-*]\s*`?([^`:\s][^`:]*?)`?\s*(?::\s*(.*))?$/.exec(l);
      if (m && !/^#/.test(l)) { const t = normTag(m[1]); if (t) out.set(t, (m[2] || '').trim()); }
    });
    return out;
  };
  // Añade al vocabulario las etiquetas nuevas, sin tocar lo que ya hay escrito.
  async function addToVocab(root, tags) {
    let text = await readText(root, 'etiquetas.md');
    if (text == null) text = TAGS_HEAD;
    const known = vocabFrom(text);
    const fresh = tags.filter(t => !known.has(t));
    if (!fresh.length && text !== TAGS_HEAD) return;
    if (fresh.length) {
      // Las nuevas van al final de «Sin describir» (si esa sección no es la última, se crea al final).
      const lastHead = (text.match(/^## .*$/gm) || []).pop();
      if (lastHead !== '## Sin describir') text = text.replace(/\s*$/, '\n\n## Sin describir\n\n');
      text = (text.replace(/\s*$/, '\n') + fresh.map(t => `- ${t}:`).join('\n') + '\n').replace(/## Sin describir\n(?!\n)/, '## Sin describir\n\n');
    }
    await writeText(root, 'etiquetas.md', text);
  }

  // Índice: se rehace leyendo todas las incidencias, así siempre está completo y al día
  // (aunque varias personas guarden en la misma carpeta compartida).
  async function rebuildIndex(root) {
    const rows = [];
    for await (const [name, h] of root.entries()) {
      if (h.kind !== 'directory') continue;
      const inc = await readText(h, 'incidencia.md');
      if (inc == null) continue;
      const parsed = FM.parse(inc);
      const d = parsed.data;
      // Incidencias guardadas con versiones anteriores (sin bloque de datos): se saca lo básico del texto.
      if (!d.titulo) {
        const t = /^#\s+(\S+)\s+[—-]\s+(.+)$/m.exec(parsed.body);
        if (t) { d.incidencia = d.incidencia || t[1]; d.titulo = t[2].trim(); }
        const st = /^Estado:\s*(.+)$/m.exec(parsed.body); if (st && !d.estado) d.estado = st[1].trim();
        const cr = /^Fecha de creación:\s*(.+)$/m.exec(parsed.body); if (cr && !d.abierta) d.abierta = cr[1].trim();
        const sv = /^- Servicio:\s*(.+)$/m.exec(parsed.body); if (sv && !d.servicio) d.servicio = sv[1].trim();
        const url = /^URL:\s*(\S+)/m.exec(parsed.body); if (url && !d.url) d.url = url[1];
      }
      const c = FM.parse((await readText(h, 'clasificacion.md')) || '').data;
      rows.push({
        incidencia: d.incidencia || name, carpeta: name, titulo: d.titulo || '', estado: d.estado || '',
        servicio: d.servicio || '', categoria: d.categoria_operacional || d.categoria_producto || '',
        equipo: d.equipo_resolutor || d.equipo_actual || '', abierta: d.abierta || '',
        activo: d.activo || '', url: d.url || '',
        etiquetas: uniqTags([].concat(c.etiquetas || [], d.etiquetas || [])),
        causa: c.causa || '', solucion: c.solucion || d.resolucion || '',
        documentacion: c.documentacion || '', documentacion_url: c.documentacion_url || '',
        guardada: d.guardada || ''
      });
    }
    const key = r => { const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(r.abierta); return m ? +m[3] * 1e4 + +m[2] * 100 + +m[1] : 0; };
    rows.sort((a, b) => key(b) - key(a) || (a.incidencia < b.incidencia ? 1 : -1));
    const cell = v => String(v || '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
    // La columna de documentación solo aparece si alguna incidencia la usa.
    const withDoc = rows.some(r => r.documentacion || r.documentacion_url);
    const docCell = r => r.documentacion_url ? `[${cell(r.documentacion || 'documentada')}](${r.documentacion_url})` : cell(r.documentacion);
    const md = '# Índice de incidencias\n\nSe regenera al guardar cada incidencia desde SmartIT.\n\n' +
      `| Incidencia | Título | Servicio | Equipo | Etiquetas | Solución |${withDoc ? ' Documentación |' : ''} Estado | Abierta |\n` +
      `|---|---|---|---|---|---|${withDoc ? '---|' : ''}---|---|\n` +
      rows.map(r => `| [${cell(r.incidencia)}](${encodeURI(r.carpeta)}/incidencia.md) | ${cell(r.titulo)} | ${cell(r.servicio)} | ${cell(r.equipo)} | ${cell(r.etiquetas.join(', '))} | ${cell(r.solucion)} |${withDoc ? ` ${docCell(r)} |` : ''} ${cell(r.estado)} | ${cell(r.abierta)} |`).join('\n') + '\n';
    await writeText(root, 'indice.md', md);
    await writeText(root, 'indice.jsonl', rows.map(r => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
    return rows;
  }

  // ---------- eliminar incidencias guardadas ----------
  // Borra del todo la carpeta de cada incidencia (con lo que haya dejado el agente) y regenera el índice.
  // Solo acepta subcarpetas directas que tengan un incidencia.md, para no borrar nada más por error.
  // etiquetas.md no se toca: es el vocabulario y sigue valiendo aunque no quede ninguna con esa etiqueta.
  async function remove(root, folders) {
    const done = [], failed = [];
    for (const name of folders) {
      try {
        if (!name || /[\\/]/.test(name) || name === '.' || name === '..') throw new Error('nombre no válido');
        const dir = await root.getDirectoryHandle(name);
        if ((await readText(dir, 'incidencia.md')) == null) throw new Error('no es una incidencia guardada');
        await root.removeEntry(name, { recursive: true });
        done.push(name);
      } catch (err) { failed.push({ name, error: err.message || String(err) }); }
    }
    const rows = await rebuildIndex(root);
    return { done, failed, rows };
  }

  // ---------- incidencias relacionadas ----------
  // Puntuación sencilla con el índice: etiquetas en común (lo que más pesa), mismo servicio,
  // categoría o activo, y palabras del título en común.
  const STOP = new Set('para porque desde sobre entre cuando donde como pero tiene tienen hace cliente clientes error problema incidencia indica puede pueden esta este estos estas solicitud'.split(' '));
  const words = t => new Set(String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !STOP.has(w)));
  async function related(handle, cur, limit = 10) {
    let jsonl = await readText(handle, 'indice.jsonl');
    if (jsonl == null) { try { await rebuildIndex(handle); jsonl = (await readText(handle, 'indice.jsonl')) || ''; } catch (_) { jsonl = ''; } }
    const tags = uniqTags(cur.tags || []);
    const fm = cur.frontmatter || {};
    const me = safe(cur.folder || '');
    const tw = words(fm.titulo);
    const eq = (a, b) => a && b && String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
    const rows = [];
    jsonl.split('\n').forEach(l => { try { const r = JSON.parse(l); if (r) rows.push(r); } catch (_) {} });
    // Un servicio o activo que aparece en casi todas las incidencias (más del 60 %, con al menos 5)
    // no distingue unas de otras: no suma. Así un equipo de un solo servicio no ve «parecidas» por eso.
    const common = field => {
      const v = String(fm[field] || '').trim().toLowerCase();
      if (!v || rows.length < 5) return false;
      return rows.filter(r => String(r[field] || '').trim().toLowerCase() === v).length / rows.length > 0.6;
    };
    const skipServicio = common('servicio'), skipActivo = common('activo');
    const out = [];
    rows.forEach(r => {
      if (r.carpeta === me) return;
      const shared = (r.etiquetas || []).filter(t => tags.includes(t));
      const reasons = [];
      let score = shared.length * 3;
      if (!skipServicio && eq(r.servicio, fm.servicio)) { score += 2; reasons.push('mismo servicio'); }
      if (eq(r.categoria, fm.categoria_operacional || fm.categoria_producto)) { score += 2; reasons.push('misma categoría'); }
      if (!skipActivo && eq(r.activo, fm.activo)) { score += 2; reasons.push('mismo activo'); }
      const inTitle = [...words(r.titulo)].filter(w => tw.has(w)).length;
      if (inTitle) { score += Math.min(inTitle, 3); reasons.push(inTitle === 1 ? 'una palabra del título en común' : `${inTitle} palabras del título en común`); }
      if (score >= 3) out.push({ ...r, shared, reasons, score });
    });
    out.sort((a, b) => b.score - a.score || (b.solucion ? 1 : 0) - (a.solucion ? 1 : 0));
    related.total = rows.length;
    related.more = Math.max(0, out.length - limit);
    return out.slice(0, limit);
  }

  // Estado de la documentación externa (si el equipo la usa), tal cual está en clasificacion.md.
  const docOf = d => (d.documentacion || d.documentacion_url)
    ? { estado: String(d.documentacion || '').trim().toLowerCase(), url: d.documentacion_url || '', fecha: d.documentacion_fecha || '' } : null;

  // Etiquetas para el visor: las de esta incidencia y todas las conocidas (vocabulario + índice).
  async function tagsInfo(handle, folder) {
    const root = handle;
    const vocab = vocabFrom(await readText(root, 'etiquetas.md'));
    const known = new Set(vocab.keys());
    const jsonl = (await readText(root, 'indice.jsonl')) || '';
    jsonl.split('\n').forEach(l => { try { (JSON.parse(l).etiquetas || []).forEach(t => known.add(t)); } catch (_) {} });
    let current = null, savedAt = '', doc = null;
    try {
      const dir = await root.getDirectoryHandle(safe(folder));
      const c = await readText(dir, 'clasificacion.md');
      if (c != null) {
        const cd = FM.parse(c).data;
        current = uniqTags(cd.etiquetas || []);
        doc = docOf(cd);
      }
      const inc = await readText(dir, 'incidencia.md');
      if (inc != null) savedAt = FM.parse(inc).data.guardada || '';
      if (inc != null && !savedAt) savedAt = '?'; // guardada con una versión anterior, sin fecha
    } catch (_) { /* aún no se ha guardado */ }
    return { known: [...known].sort(), descriptions: Object.fromEntries(vocab), current, savedAt, doc };
  }

  // Al volver a guardar: incidencia.md se reescribe y adjuntos/ se rehace para que coincida con la
  // incidencia actual. clasificacion.md (etiquetas, causa, solución) se conserva y solo se actualizan
  // sus etiquetas. Después se ponen al día el vocabulario y el índice de la raíz.
  // meta: { frontmatter: {...}, tags: [...], tagsLoaded: bool }
  async function write(handle, folder, files, meta) {
    meta = meta || {};
    const base = await handle.getDirectoryHandle(safe(folder), { create: true });
    // Etiquetas: si el visor llegó a leer las guardadas, manda él; si no, se suman para no perder ninguna.
    const prev = FM.parse((await readText(base, 'clasificacion.md')) || '');
    const prevTags = uniqTags(prev.data.etiquetas || []);
    const tags = meta.tagsLoaded ? uniqTags(meta.tags) : uniqTags([...prevTags, ...(meta.tags || [])]);
    const clas = { ...prev.data, etiquetas: tags };
    if (!('causa' in clas)) clas.causa = '';
    if (!('solucion' in clas)) clas.solucion = '';
    const clasBody = prev.body.trim() ? prev.body : '\nNotas libres sobre la causa y la solución (las mantiene la persona o el agente; la extensión no las borra).\n';
    await writeText(base, 'clasificacion.md', FM.stringify(clas, true) + clasBody);

    try { await base.removeEntry('adjuntos', { recursive: true }); } catch (_) { /* no existía */ }
    for (const f of files) {
      const parts = f.path.split('/').map(safe);
      let dir = base;
      for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p, { create: true });
      const fh = await dir.getFileHandle(parts[parts.length - 1], { create: true });
      const w = await fh.createWritable();
      try {
        if (f.dataUrl) await w.write(await (await fetch(f.dataUrl)).blob());
        else {
          let text = f.text || '';
          if (f.path === 'incidencia.md' && meta.frontmatter) {
            const fm = { ...meta.frontmatter, etiquetas: tags };
            if (clas.solucion) fm.solucion = clas.solucion;
            text = FM.stringify(fm) + '\n' + text;
          }
          await w.write(new Blob([text], { type: 'text/markdown' }));
        }
      } finally { await w.close(); }
    }
    // La raíz: si falla algo aquí, la incidencia ya está guardada.
    let rows = null;
    try {
      await addToVocab(handle, tags);
      rows = await rebuildIndex(handle);
    } catch (err) { console.warn('[SmartIT export] índice', err); }
    return { folderName: handle.name, folder: safe(folder), tags, doc: docOf(clas), indexed: rows ? rows.length : null };
  }

  // Prompts que copia «Copiar prompt» (investigar y documentar). Las plantillas se editan en los ajustes; variables:
  // {incidencia} {titulo} {carpeta} (ruta de la incidencia) {raiz} (ruta de la carpeta elegida).
  const DEFAULT_PROMPT = 'Analiza la incidencia {incidencia} – {titulo}.\n' +
    'Está en {carpeta}/incidencia.md y sus adjuntos en {carpeta}/adjuntos/ (revisa también las imágenes).\n' +
    'Busca incidencias parecidas en {raiz}/indice.md.';
  // Para incidencias ya finalizadas (resueltas, cerradas, canceladas): solo documentar, no investigar.
  const DEFAULT_DOC_PROMPT = 'La incidencia {incidencia} – {titulo} ya está finalizada: no hay que investigarla ni resolverla, solo dejarla bien documentada.\n' +
    'Revisa {carpeta}/incidencia.md y sus adjuntos en {carpeta}/adjuntos/, completa causa, solución y etiquetas en {carpeta}/clasificacion.md y prepara la documentación siguiendo el procedimiento del equipo.\n' +
    'Comprueba en {raiz}/indice.md si hay incidencias parecidas ya documentadas.';
  function prompt({ agentPath, folderName, folder, number, summary, template, doc }) {
    const base = (agentPath || '').trim().replace(/[\\/]+$/, '');
    const win = base.includes('\\') && !base.includes('/');
    const root = base || folderName || 'la carpeta elegida';
    const dir = root + (win ? '\\' : '/') + folder;
    let text = (template && template.trim()) || (doc ? DEFAULT_DOC_PROMPT : DEFAULT_PROMPT);
    const vars = { incidencia: number || folder, titulo: summary || '', carpeta: dir, raiz: root };
    text = text.replace(/\{(incidencia|titulo|carpeta|raiz)\}/g, (_, k) => vars[k]);
    // Rutas de Windows: las barras de la plantilla («{carpeta}/adjuntos/») pasan a «\\».
    if (win) text = text.replace(new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '[^\\s)]*', 'g'), m => m.replace(/\//g, '\\'));
    return text.replace(/ – \./g, '.').replace(/[ \t]+\n/g, '\n').trim();
  }

  return { get, set, clear, status, write, remove, safe, prompt, DEFAULT_PROMPT, DEFAULT_DOC_PROMPT, tagsInfo, related, rebuildIndex, readText, normTag, FM };
})();
