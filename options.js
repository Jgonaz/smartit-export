(async () => {
  'use strict';
  const $ = id => document.getElementById(id);
  // ?save=1: abierta desde «Guardar» sin carpeta (o sin permiso); al elegirla se termina de guardar.
  const saveMode = new URLSearchParams(location.search).get('save'); // 'no-folder' | 'permission' | null
  const fromSave = !!saveMode;
  if (fromSave) document.body.classList.add('popup');
  if (saveMode === 'permission') {
    $('opt-title').textContent = 'Confirma el permiso';
    $('opt-lede').innerHTML = 'Chrome solo da el primer permiso mientras está abierta esta ventana. Pulsa <strong>Dar permiso y guardar</strong> y elige <strong>«Permitir en cada visita»</strong>: no volverá a preguntar.';
  } else if (fromSave) {
    $('opt-title').textContent = 'Elige dónde guardar';
    $('opt-lede').textContent = 'Elige la carpeta donde se guardarán las incidencias. Después, «Guardar» escribirá ahí directamente.';
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
    // El botón principal es lo que toca hacer ahora; el resto, como enlaces.
    const needGrant = st === 'prompt';
    $('grant').hidden = !needGrant;
    $('grant').textContent = fromSave ? 'Dar permiso y guardar' : 'Dar permiso';
    const pickLabel = handle ? 'Cambiar carpeta' : 'Elegir carpeta';
    if (needGrant) { $('pick').className = 'text-link'; $('pick').innerHTML = `<span class="u">${pickLabel}</span>`; }
    else { $('pick').className = 'btn-card'; $('pick').textContent = pickLabel; }
    $('forget').hidden = !handle;
    $('pick-note').innerHTML = needGrant
      ? 'En el aviso de Chrome elige <strong>«Permitir en cada visita»</strong>. Si eliges «Permitir esta vez», habrá que repetirlo en la próxima sesión.'
      : 'Chrome te preguntará si la extensión puede modificar archivos en esa carpeta. Puede que la siguiente vez te pida confirmarlo una vez más: elige <strong>«Permitir en cada visita»</strong> y no volverá a preguntar.';
    await renderPrompt(handle);
    return { handle, st };
  }

  async function renderPrompt(handle) {
    handle = handle || await SieCarpeta.get();
    $('prompt-preview').textContent = SieCarpeta.prompt({
      agentPath: $('agent-path').value, folderName: handle && handle.name, template: $('prompt-template').value,
      folder: 'INC000000123456', number: 'INC000000123456', summary: 'Título de la incidencia'
    });
  }

  // Termina el guardado que dejó pendiente el visor.
  async function finishPending(handle) {
    const { pendingSave } = await chrome.storage.local.get('pendingSave');
    if (!pendingSave) return false;
    msg('Guardando la incidencia…');
    try {
      const r = await SieCarpeta.write(handle, pendingSave.folder, pendingSave.files, pendingSave.meta);
      await chrome.storage.local.remove('pendingSave');
      await chrome.storage.local.set({ lastSave: { ok: true, token: pendingSave.token, at: Date.now(), ...r } });
      msg(`Incidencia guardada en ${r.folderName}/${r.folder}.` + (fromSave ? ' Revisa la ruta para el agente y pulsa «Guardar cambios» para volver.' : ''), 'ok');
      if ($('next-time').hidden) $('done').focus();
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
    // Ruta para el agente: Chrome solo da el nombre de la carpeta, así que se rellena con él
    // (si estaba vacía o era el nombre de la anterior) y se pide completarla.
    const prevName = $('agent-path').dataset.autoName || '';
    if (!$('agent-path').value.trim() || $('agent-path').value.trim() === prevName) {
      $('agent-path').value = handle.name;
      $('agent-path').dataset.autoName = handle.name;
      chrome.storage.local.set({ agentPath: handle.name });
      $('agent-hint').hidden = false;
    }
    await render();
    if (st === 'granted') {
      if (!(await finishPending(handle))) msg('Carpeta guardada.', 'ok');
      // Primer permiso: solo dura esta sesión. Se avisa de lo que pasará la próxima vez.
      $('next-time').hidden = false;
      $('pick-note').hidden = true; // el aviso ya lo explica
      $('next-time-ok').focus();
    }
    else msg('Sin permiso de escritura no se puede guardar en esta carpeta.', 'err');
  });

  $('next-time-ok').addEventListener('click', () => { $('next-time').hidden = true; $('pick-note').hidden = false; $('done').focus(); });

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

  const { agentPath = '', promptTemplate = '' } = await chrome.storage.local.get(['agentPath', 'promptTemplate']);
  $('agent-path').value = agentPath;
  $('prompt-template').value = promptTemplate || SieCarpeta.DEFAULT_PROMPT;
  // Se guarda vacío si es el de por defecto, para que futuras mejoras del prompt por defecto lleguen solas.
  const savePrompt = () => {
    const v = $('prompt-template').value.trim();
    chrome.storage.local.set({ promptTemplate: v && v !== SieCarpeta.DEFAULT_PROMPT.trim() ? v : '' });
  };
  let pt;
  $('prompt-template').addEventListener('input', () => { renderPrompt(); clearTimeout(pt); pt = setTimeout(savePrompt, 300); });
  $('prompt-reset').addEventListener('click', () => { $('prompt-template').value = SieCarpeta.DEFAULT_PROMPT; renderPrompt(); savePrompt(); });
  let t;
  $('agent-path').addEventListener('input', () => {
    renderPrompt();
    clearTimeout(t);
    t = setTimeout(() => chrome.storage.local.set({ agentPath: $('agent-path').value.trim() }), 300);
  });

  // ---------- actualizaciones ----------
  const { autoUpdateCheck = true } = await chrome.storage.local.get('autoUpdateCheck');
  $('auto-update').checked = autoUpdateCheck !== false;
  $('auto-update').addEventListener('change', () => chrome.storage.local.set({ autoUpdateCheck: $('auto-update').checked }));
  const showUpdate = info => {
    if (!info || info.failed) { $('update-status').textContent = 'No se pudo comprobar (¿sin conexión?).'; return; }
    $('update-status').textContent = info.available
      ? `Hay una versión nueva: ${info.remote} (tienes la ${info.installed}).`
      : `Tienes la última versión (${info.installed}).`;
  };
  $('check-now').addEventListener('click', async () => {
    $('update-status').textContent = 'Comprobando…';
    try { showUpdate(await chrome.runtime.sendMessage({ type: 'update-info', force: true })); } catch (_) { showUpdate(null); }
  });

  // Tema y estilo como en el visor.
  const applyLook = ({ theme, style }) => {
    const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    if (style === 'classic') document.documentElement.dataset.style = 'classic'; else delete document.documentElement.dataset.style;
  };
  applyLook(await chrome.storage.local.get(['theme', 'style']));

  // «Guardar cambios»: guarda la ruta para el agente y cierra la ventana.
  if (fromSave) $('foot-note').textContent = 'Al terminar, pulsa «Guardar cambios» para cerrar esta ventana.';
  $('done').addEventListener('click', async () => {
    clearTimeout(t); clearTimeout(pt);
    await chrome.storage.local.set({ agentPath: $('agent-path').value.trim() });
    savePrompt();
    $('done').textContent = 'Guardado';
    setTimeout(() => {
      window.close(); // en una pestaña abierta desde chrome://extensions puede no cerrarse: se deja el aviso
      $('done').textContent = 'Guardar cambios';
      $('foot-note').textContent = 'Cambios guardados.';
    }, 350);
  });

  // En la ventanita, el alto se ajusta al contenido (sin pasar del alto de la pantalla).
  if (fromSave) {
    const fit = async () => {
      try {
        const win = await chrome.windows.getCurrent();
        const chromeH = window.outerHeight - window.innerHeight;
        const contentH = document.querySelector('.opt-wrap').offsetHeight + document.querySelector('.opt-foot').offsetHeight;
        const h = Math.min(screen.availHeight, Math.ceil(contentH + chromeH));
        if (Math.abs(h - win.height) < 4) return;
        const top = Math.max(screen.availTop || 0, Math.round(win.top + (win.height - h) / 2));
        await chrome.windows.update(win.id, { height: h, top });
      } catch (_) { /* fuera de una ventana de la extensión */ }
    };
    let fitT;
    new ResizeObserver(() => { clearTimeout(fitT); fitT = setTimeout(fit, 60); }).observe(document.querySelector('.opt-wrap'));
  }

  const { st } = await render();
  if (fromSave && st === 'prompt') $('grant').focus(); else if (fromSave) $('pick').focus();
})();
