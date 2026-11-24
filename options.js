(async () => {
  'use strict';
  const $ = id => document.getElementById(id);
  // ?save=1: abierta desde «Guardar» sin carpeta (o sin permiso); al elegirla se termina de guardar.
  const fromSave = new URLSearchParams(location.search).has('save');
  if (fromSave) {
    document.body.classList.add('popup');
    $('opt-title').textContent = 'Elige dónde guardar';
    $('opt-lede').textContent = 'Solo hace falta la primera vez: a partir de ahora, «Guardar» escribirá directamente en esta carpeta.';
  }

  const msg = (text, kind) => { const m = $('msg'); m.hidden = !text; m.textContent = text || ''; m.className = 'opt-msg' + (kind ? ' ' + kind : ''); };

  async function render() {
    const handle = await SieCarpeta.get();
    const st = await SieCarpeta.status(handle);
    $('folder-name').textContent = handle ? handle.name : 'Ninguna carpeta elegida';
    $('folder-status').textContent = {
      none: 'Al pulsar «Guardar» en el visor se te pedirá que elijas una.',
      granted: 'Lista: «Guardar» escribe aquí directamente.',
      prompt: 'Chrome necesita que vuelvas a dar permiso para escribir en ella.',
      denied: 'Chrome ha bloqueado el permiso para escribir en ella. Elige otra carpeta o revisa los permisos del sitio.'
    }[st] || '';
    $('pick').textContent = handle ? 'Cambiar carpeta' : 'Elegir carpeta';
    $('grant').hidden = st !== 'prompt';
    $('forget').hidden = !handle;
    await renderPrompt(handle);
    return { handle, st };
  }

  async function renderPrompt(handle) {
    handle = handle || await SieCarpeta.get();
    $('prompt-preview').textContent = SieCarpeta.prompt({
      agentPath: $('agent-path').value, folderName: handle && handle.name,
      folder: 'INC000000123456', number: 'INC000000123456', summary: 'Título de la incidencia'
    });
  }

  // Termina el guardado que dejó pendiente el visor.
  async function finishPending(handle) {
    const { pendingSave } = await chrome.storage.local.get('pendingSave');
    if (!pendingSave) return false;
    msg('Guardando la incidencia…');
    try {
      const r = await SieCarpeta.write(handle, pendingSave.folder, pendingSave.files);
      await chrome.storage.local.remove('pendingSave');
      await chrome.storage.local.set({ lastSave: { ok: true, token: pendingSave.token, at: Date.now(), ...r } });
      msg(`Guardada en ${r.folderName}/${r.folder}.`, 'ok');
      if (fromSave && $('agent-path').value.trim()) setTimeout(() => window.close(), 1400);
      else if (fromSave) msg(`Guardada en ${r.folderName}/${r.folder}. Si quieres, escribe abajo la ruta para el agente y cierra esta ventana.`, 'ok');
      return true;
    } catch (err) {
      await chrome.storage.local.set({ lastSave: { ok: false, token: pendingSave.token, at: Date.now(), error: String(err.message || err) } });
      msg('No se pudo guardar: ' + (err.message || err), 'err');
      return false;
    }
  }

  $('pick').addEventListener('click', async () => {
    msg('');
    let handle;
    try {
      handle = await window.showDirectoryPicker({ id: 'sie-incidencias', mode: 'readwrite', startIn: 'documents' });
    } catch (err) {
      if (err && err.name === 'AbortError') return; // cerró el selector
      msg('No se pudo elegir la carpeta: ' + (err.message || err), 'err');
      return;
    }
    // El selector en modo lectura/escritura ya da permiso; por si acaso, se confirma.
    let st = await SieCarpeta.status(handle);
    if (st !== 'granted') st = await handle.requestPermission({ mode: 'readwrite' });
    await SieCarpeta.set(handle);
    await render();
    if (st === 'granted') { if (!(await finishPending(handle))) msg('Carpeta guardada.', 'ok'); }
    else msg('Sin permiso de escritura no se puede guardar en esta carpeta.', 'err');
  });

  $('grant').addEventListener('click', async () => {
    const handle = await SieCarpeta.get();
    if (!handle) return;
    const st = await handle.requestPermission({ mode: 'readwrite' });
    await render();
    if (st === 'granted') { if (!(await finishPending(handle))) msg('Permiso concedido.', 'ok'); }
  });

  $('forget').addEventListener('click', async () => {
    await SieCarpeta.clear();
    msg('La extensión ya no usará esa carpeta. Los archivos guardados siguen en tu equipo.', 'ok');
    await render();
  });

  const { agentPath = '' } = await chrome.storage.local.get('agentPath');
  $('agent-path').value = agentPath;
  let t;
  $('agent-path').addEventListener('input', () => {
    renderPrompt();
    clearTimeout(t);
    t = setTimeout(() => chrome.storage.local.set({ agentPath: $('agent-path').value.trim() }), 300);
  });

  // Tema y estilo como en el visor.
  const applyLook = ({ theme, style }) => {
    const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    if (style === 'classic') document.documentElement.dataset.style = 'classic'; else delete document.documentElement.dataset.style;
  };
  applyLook(await chrome.storage.local.get(['theme', 'style']));

  const { st } = await render();
  if (fromSave && st === 'prompt') $('grant').focus(); else if (fromSave) $('pick').focus();
})();
