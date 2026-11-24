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
  const MARK = '<!-- generado por SmartIT export, v1. Si editas este archivo a mano, borra esta línea para que la extensión no lo vuelva a escribir. -->';
  const AGENTS_MD = `${MARK}
# Incidencias guardadas desde SmartIT

Cada subcarpeta es una incidencia (su número), guardada con la extensión «SmartIT export».

\`\`\`
INC000012345678/
  incidencia.md      ficha, descripción y toda la actividad (se regenera al volver a guardar)
  adjuntos/          imágenes y archivos de la incidencia (se regenera al volver a guardar)
  clasificacion.md   etiquetas, causa y solución (lo mantienen la persona y el agente; no se borra)
indice.md            una fila por incidencia: título, servicio, equipo, etiquetas y solución
indice.jsonl         lo mismo, una línea JSON por incidencia (para buscar con grep / jq)
etiquetas.md         vocabulario de etiquetas con su significado
\`\`\`

## Cuando te pidan analizar una incidencia

1. Lee su \`incidencia.md\` (y las imágenes de \`adjuntos/\`).
2. **Busca incidencias parecidas antes de proponer nada.** Mira \`indice.md\` o busca en \`indice.jsonl\` por:
   - las mismas etiquetas o etiquetas cercanas de \`etiquetas.md\`,
   - el mismo servicio, categoría o activo afectado,
   - palabras clave del problema y mensajes de error literales (busca también dentro de los \`incidencia.md\`).
3. De las parecidas, lee su \`clasificacion.md\` (causa y solución) y, si hace falta, su \`incidencia.md\`.
   Di cuáles son (número y título), qué tienen en común y cómo se resolvieron.
4. Propón un diagnóstico y los siguientes pasos para la incidencia actual.

## Después de analizarla

Rellena o actualiza el \`clasificacion.md\` de la incidencia:

- \`etiquetas\`: usa las de \`etiquetas.md\`. Si de verdad hace falta una nueva, añádela allí con una línea que la explique.
  Formato: minúsculas y guiones (\`correo-no-llega\`), sin sinónimos de una ya existente.
- \`causa\` y \`solucion\`: una o dos frases, lo bastante concretas para que sirvan la próxima vez.
- Debajo del bloque puedes escribir notas libres.

No modifiques \`incidencia.md\` ni \`adjuntos/\`: se sobrescriben al volver a guardar desde SmartIT.
El índice se regenera solo al guardar; si cambias un \`clasificacion.md\`, puedes actualizar a mano su fila del índice.

Contienen datos reales de clientes: no los copies fuera de esta carpeta.
`;
  const TAGS_HEAD = '# Vocabulario de etiquetas\n\nUna línea por etiqueta: `- etiqueta: qué significa`. Úsalas siempre igual (minúsculas y guiones) para que las búsquedas encuentren las incidencias parecidas.\n\n';

  async function ensureAgentsMd(root) {
    const cur = await readText(root, 'AGENTS.md');
    if (cur == null || (cur.startsWith('<!-- generado por SmartIT export') && cur !== AGENTS_MD)) await writeText(root, 'AGENTS.md', AGENTS_MD);
  }
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
      const d = FM.parse(inc).data;
      const c = FM.parse((await readText(h, 'clasificacion.md')) || '').data;
      rows.push({
        incidencia: d.incidencia || name, carpeta: name, titulo: d.titulo || '', estado: d.estado || '',
        servicio: d.servicio || '', categoria: d.categoria_operacional || d.categoria_producto || '',
        equipo: d.equipo_resolutor || d.equipo_actual || '', abierta: d.abierta || '',
        etiquetas: uniqTags([].concat(c.etiquetas || [], d.etiquetas || [])),
        causa: c.causa || '', solucion: c.solucion || d.resolucion || ''
      });
    }
    const key = r => { const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(r.abierta); return m ? +m[3] * 1e4 + +m[2] * 100 + +m[1] : 0; };
    rows.sort((a, b) => key(b) - key(a) || (a.incidencia < b.incidencia ? 1 : -1));
    const cell = v => String(v || '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
    const md = '# Índice de incidencias\n\nSe regenera al guardar desde SmartIT. Cómo usarlo: ver `AGENTS.md`.\n\n' +
      '| Incidencia | Título | Servicio | Equipo | Etiquetas | Solución | Estado | Abierta |\n|---|---|---|---|---|---|---|---|\n' +
      rows.map(r => `| [${cell(r.incidencia)}](${encodeURI(r.carpeta)}/incidencia.md) | ${cell(r.titulo)} | ${cell(r.servicio)} | ${cell(r.equipo)} | ${cell(r.etiquetas.join(', '))} | ${cell(r.solucion)} | ${cell(r.estado)} | ${cell(r.abierta)} |`).join('\n') + '\n';
    await writeText(root, 'indice.md', md);
    await writeText(root, 'indice.jsonl', rows.map(r => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
    return rows;
  }

  // Etiquetas para el visor: las de esta incidencia y todas las conocidas (vocabulario + índice).
  async function tagsInfo(handle, folder) {
    const root = handle;
    const vocab = vocabFrom(await readText(root, 'etiquetas.md'));
    const known = new Set(vocab.keys());
    const jsonl = (await readText(root, 'indice.jsonl')) || '';
    jsonl.split('\n').forEach(l => { try { (JSON.parse(l).etiquetas || []).forEach(t => known.add(t)); } catch (_) {} });
    let current = null;
    try {
      const dir = await root.getDirectoryHandle(safe(folder));
      const c = await readText(dir, 'clasificacion.md');
      if (c != null) current = uniqTags(FM.parse(c).data.etiquetas || []);
    } catch (_) { /* aún no se ha guardado */ }
    return { known: [...known].sort(), descriptions: Object.fromEntries(vocab), current };
  }

  // Al volver a guardar: incidencia.md se reescribe y adjuntos/ se rehace para que coincida con la
  // incidencia actual. clasificacion.md (etiquetas, causa, solución) se conserva y solo se actualizan
  // sus etiquetas. Después se ponen al día el vocabulario, el índice y el AGENTS.md de la raíz.
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
      await ensureAgentsMd(handle);
      await addToVocab(handle, tags);
      rows = await rebuildIndex(handle);
    } catch (err) { console.warn('[SmartIT export] índice', err); }
    return { folderName: handle.name, folder: safe(folder), tags, indexed: rows ? rows.length : null };
  }

  // Prompt que se copia al guardar, para pegarlo en el agente (Copilot CLI, etc.).
  function prompt({ agentPath, folderName, folder, number, summary }) {
    const base = (agentPath || '').trim().replace(/[\\/]+$/, '');
    const sep = base.includes('\\') && !base.includes('/') ? '\\' : '/';
    const dir = base ? base + sep + folder : `${folderName || 'la carpeta elegida'}${sep}${folder}`;
    const title = [number, summary].filter(Boolean).join(' – ');
    const root = base || folderName || 'la carpeta elegida';
    return `Analiza la incidencia ${title || folder}. Antes, lee ${root}${sep}AGENTS.md: explica cómo están organizadas ` +
      `las incidencias guardadas y cómo buscar otras parecidas en ${root}${sep}indice.md. ` +
      `La incidencia está en ${dir}${sep}incidencia.md y sus adjuntos en ${dir}${sep}adjuntos${sep} (revisa también las imágenes). ` +
      `Al terminar, rellena su clasificacion.md con etiquetas, causa y solución.`;
  }

  return { get, set, clear, status, write, safe, prompt, tagsInfo, normTag, FM };
})();
