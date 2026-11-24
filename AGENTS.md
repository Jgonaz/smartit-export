# AGENTS.md

Guía para agentes (y personas) que retomen este repositorio. Recoge lo que se aprendió al construir la extensión y que no se deduce leyendo el código: cómo es SmartIT por dentro, por qué se tomaron ciertas decisiones y qué normas sigue el repo.

## Normas del repositorio

- **El repo es público.** No escribas nunca el dominio real de ninguna empresa (usa el genérico `*.onbmc.com`), ni números de incidencia, nombres de personas, correos u otros datos reales. Las capturas y los datos de prueba son siempre inventados.
- **Nada se sube sin el visto bueno del dueño del repo.** Prepara los cambios en local, entrega un .zip para probar y espera a que lo apruebe antes de hacer push.
- **Autoría:** los commits van a nombre del dueño del repo y sin líneas `Co-Authored-By` ni similares de herramientas de IA (no deben aparecer como colaboradores en GitHub).
- **Versión:** sube `version` en `manifest.json` en cada cambio publicado. La extensión compara su versión con la del `manifest.json` de `main` (una vez al día) para mostrar el aviso de versión nueva. Se puede desactivar en las opciones (`autoUpdateCheck`, activado por defecto); «Comprobar ahora» consulta aunque esté desactivado.
- **Solo lectura:** la extensión no crea, modifica ni borra nada en SmartIT. Lo único que pulsa son los botones de paginación de la actividad.
- **Sesión:** nunca pidas, registres ni guardes tokens o cabeceras de sesión. Si necesitas que alguien te pase una petición de red para depurar, pide que sustituya los valores sensibles por `XXX`.
- **Sin peticiones externas:** todo es local. Las fuentes (DM Sans, JetBrains Mono, Inter; licencia OFL, en `fonts/`) van dentro de la extensión.
- Interfaz y textos en español.

## Arquitectura

| Archivo | Dónde corre | Qué hace |
|---|---|---|
| `top.js` | Página de SmartIT (`/smartit/app/*`) | Icono de la cabecera, capa de carga con el anillo de progreso, iframe del visor incrustado. |
| `main-hook.js` | Iframe de la ficha (`/arsys/pwa/*`), `world: MAIN`, `document_start` | Observa (sin modificarlas) las peticiones XHR/fetch de la app a `/arsys/web/` y deja en `document.documentElement.dataset` la cabecera `st` (`sieSt`) y el `formNameToken` de cada formulario (`sieForms`). |
| `content.js` | Iframe de la ficha, todos los marcos | Lee campos, resumen de HelixGPT y actividad (todas las páginas) y descarga los adjuntos. |
| `background.js` | Service worker | Guarda cada exportación en `chrome.storage.local` con una clave aleatoria (`exp_<fecha>_<uuid>`), conserva las 10 más recientes y comprueba si hay versión nueva. |
| `viewer.html/.js/.css`, `theme.js` | Página de la extensión | El visor. `theme.js` aplica tema y estilo antes de pintar para evitar parpadeos. |
| `options.html/.js/.css` | Página de opciones de la extensión | Elegir la carpeta donde guardar, volver a dar permiso y la ruta para el agente. |
| `carpeta.js`, `offscreen.html/.js` | Opciones y documento oculto | Guardan la referencia a la carpeta en IndexedDB y escriben los archivos. |

### Mensajes entre marcos (`postMessage`, campo `sie`)

- Ficha → página: `ready` (cada 700 ms, indica si la ficha ya cargó; el icono solo aparece entonces y si la URL es de una ficha `#/…PV/…`).
- Página → ficha: `export`. Respuestas: `started`, `progress` (texto, `page`/`total` al leer páginas), `done` (con el id de la exportación) o `error`. Si pasan unos segundos sin progreso al leer páginas, `top.js` va rotando frases de espera para que no parezca colgado.
- Visor → página: `viewer-ready` (ya pintado, se muestra con la animación), `viewer-close` (Esc), `update-dismissed`.
- `top.js` solo acepta mensajes de orígenes `*.onbmc.com`.

### Visor incrustado

El visor se carga en un iframe con `chrome.runtime.getURL('viewer.html')#<id>`. Para ello `viewer.html/js/css`, `theme.js` y `fonts/*` están en `web_accessible_resources` (solo para `https://*.onbmc.com/*`). El iframe lleva `allow="clipboard-write"` para que funcione "Copiar para el agente". SmartIT no puede leer el contenido del iframe porque es de otro origen. No se usa `use_dynamic_url` por compatibilidad. Al cerrar, el visor se guarda en caché para reabrirlo al instante si no cambia la incidencia.

## SmartIT por dentro (Helix Progressive Views)

La ficha de la incidencia vive en un iframe (`/arsys/pwa/…`), no en la página de SmartIT.

- **Campos:** pares `#ar<ID>_label` / `#ar<ID>_data`. Puede haber varios elementos con el mismo id: hay que usar `querySelectorAll('[id="ar<ID>_data"]')`.
- **Actividad:** celdas `smt-table-cell-field`. Cada nota es un iframe `iframe[id^="VFWLG"]` con `#content_block` (texto), `#date-block` y `#first-attachement-name` (sic) para el primer adjunto.
- **Paginación:** botones `[data-testid$="-pagination_right"]` / `_left`. El texto de estado está en un `[aria-live]`, del tipo "Registros desde 1 hasta 15 de 110". De ahí se calcula el total de páginas para el anillo "X/Y".
- **Resumen de HelixGPT:** `.helixGptChat-summary-response-content` (se lee completo aunque no se haya pulsado "Mostrar más"), autor en `#summaryGeneratedBy_data` y fecha en `.helixGptChat-summary-right-button-group`. Se convierte a un Markdown sencillo (listas anidadas y negritas).
- **Pestaña en segundo plano:** Chrome retrasa mucho los temporizadores de las pestañas ocultas (hasta una vez por minuto). Por eso `waitFor()` en `content.js` vuelve a comprobar al cambiar el DOM (MutationObserver, también dentro de los iframes de las notas) y no solo con `setTimeout`. Por lo mismo, las animaciones de la capa de carga son CSS y no dependen de temporizadores.
- **Fechas:** formato `d/m/aaaa h:mm[:ss]`, con día, mes y hora que pueden ser de **un dígito** (`9:22:28`). Regex usada: `(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?`. Las entradas con la misma marca de tiempo se ordenan por el orden inverso de lectura (campo `seq`).

### Recorrido entre equipos y estados (texto de la actividad)

- Cambio de grupo: `El Grupo de soporte ha cambiado a: X` o `Asignado a X por Y`. "Asignado a" también se usa para personas, así que `teamPath()` (en `viewer.js`) lo filtra con pistas de nombre de grupo (`GROUP_HINT`), los grupos ya vistos y las personas conocidas.
- Estado: `Estado marcado: "X" por …`. Cerrado = resuelto, cerrado o cancelado. Reabierta = un estado abierto justo después de uno cerrado.
- Las dos frases de un mismo cambio ("El grupo ha cambiado a X" y "Asignado a X") se muestran una sola vez en la conversación.

### Descarga de adjuntos

La URL de descarga necesita una clave que **no se puede construir a mano**: la parte final es un payload que da el servidor (inventarla produce HTTP 500). El flujo, igual que el de la propia app:

1. `POST /arsys/web/v1.0/backchannel/GetEntryList/HPD:WorkLog?timezone=…` con las cabeceras `st` (capturada por `main-hook.js`) y `x-mid-ajax-request: 1`, y en el cuerpo el `formNameToken` del formulario actual, la calificación `4\1\1\1\99\304424671\` con el id de la nota y los campos de adjunto `1000000351/352/353`.
2. Cada valor de la respuesta viene en formato AR "longitud/valor" encadenado (`dec()`): payload, tamaño y nombre.
3. `attKey = enc(['2', payload])`.
4. `GET /arsys/web/v1.0/file/download/<servidor>?attKey=…&timezone=…`. El servidor sale del hash de la URL (`/forms/<servidor>/`).

Si la respuesta es HTML o JSON cuando no debería, se trata como error y el visor muestra la miniatura que da SmartIT.

## Decisiones del visor

- **Dos estilos** (ajustes → Estilo): "Tarjetas" (bordes negros, sombras de color desplazadas, títulos en JetBrains Mono) y "Clásico" (bordes finos, sombras suaves, acento azul, Inter). Cada uno en claro u oscuro: hay **cuatro combinaciones** y cada cambio debe revisarse en todas. El clásico es una capa CSS sobre `html[data-style="classic"]` que redefine variables y retoca algunas piezas. Tema y estilo se guardan en `chrome.storage.local` (`theme`, `style`) y se copian a `localStorage` (`sie-theme`, `sie-style`) para que `theme.js` los aplique antes de pintar. La capa de carga de `top.js` sigue los mismos ajustes.
- **Metro (recorrido):**
  - Una parada por paso, con el tiempo de cada tramo y el más largo en rojo.
  - Etiquetas "Resuelta aquí", "Reabierta" y "Está aquí".
  - Como máximo 7 paradas por fila, repartidas en filas equilibradas (las de arriba con más).
  - Al saltar de fila, un chevron "›" sutil al final de una fila y al principio de la siguiente. El tiempo de ese tramo va en el tooltip del chevron.
  - El ancho de cada nombre se ajusta al hueco entre paradas.
- **Conversación:**
  - La descripción es el primer mensaje del cliente. Si no hay más mensajes, ocupa todo el ancho.
  - Encima de cada burbuja va solo el tipo de comentario («Investigación-Diagnóstico»). Dentro, arriba, el equipo en negrita y la persona («Equipo · Nombre»; el cliente, solo su nombre), y la fecha y hora abajo a la derecha.
  - Las notas del cliente (tipo "Comunicación del cliente" o autor igual al Cliente/Contacto de la ficha) van a la izquierda. Las de agentes van a la derecha, con el color del equipo que tenía la incidencia en ese momento.
  - Los cambios de grupo son píldoras, los estados son líneas grises y los huecos de más de 2 h se muestran como "X sin actividad".
- **Tiempo:** el total va desde la creación hasta ahora, o hasta el último cierre si está cerrada. "Sin actividad" es la suma de huecos de más de 2 h entre entradas; las asignaciones automáticas también cuentan como actividad.
- **Menciones a adjuntos:** el texto que nombra un adjunto se convierte en una etiqueta que abre la imagen. El nombre completo siempre vale. El nombre sin extensión solo vale si parece un nombre de archivo (`image002`, `IMG_1234`, `captura-login`…), nunca si es una palabra suelta ("correo") o un número (que puede ser un dato del cliente).
- **Markdown para el agente:** `buildText()` genera el Markdown de "Copiar para el agente" y el `incidencia.md` que se guarda.

### Guardar en una carpeta

- Se usa la API de acceso a archivos (`showDirectoryPicker`), no la de descargas: con "Preguntar dónde guardar" activado en Chrome, la API de descargas sigue mostrando el cuadro y solo escribe dentro de Descargas.
- La carpeta se elige en `options.html`, porque Chrome no deja abrir el selector desde un marco de otro origen (el visor incrustado en SmartIT). La referencia (`FileSystemDirectoryHandle`) se guarda en IndexedDB (`sie-carpeta`).
- La escritura la hace `offscreen.html` (documento oculto creado por `background.js`), que es de la extensión y no está dentro de SmartIT. Si no hay carpeta o falta permiso, responde `no-folder` / `permission`. Entonces el visor deja los archivos en `chrome.storage.local.pendingSave` y abre `options.html?save=1` en una ventanita. Allí, al elegir la carpeta o dar permiso, se termina de guardar y se avisa al visor con `lastSave`.
- Permiso: Chrome ofrece "Permitir en cada visita" (permiso persistente). Con "Permitir esta vez" habrá que volver a darlo en otra sesión.
- **Etiquetas e índice** (`carpeta.js`):
  - `incidencia.md` empieza con un bloque YAML (frontmatter) con los datos de la ficha (servicio, categorías, equipos, estado, etiquetas…). Lo genera `frontmatter()` en `viewer.js`.
  - `clasificacion.md` guarda etiquetas, causa, solución y notas libres. Lo mantienen la persona y el agente: al volver a guardar solo se actualizan las etiquetas. Si el visor pudo leer las guardadas (`tagsLoaded`), su lista manda; si no, se suman para no perder ninguna.
  - En la raíz: `indice.md` e `indice.jsonl` se rehacen leyendo todas las incidencias (así siguen completos aunque varias personas guarden en una carpeta compartida). `etiquetas.md` es el vocabulario: las etiquetas nuevas se añaden en «Sin describir» sin tocar lo escrito. `AGENTS.md` lleva instrucciones para el agente; se reescribe solo si conserva la marca de «generado», para respetar los cambios a mano.
  - El visor pide `tags-info` para sugerir etiquetas y cargar las de la incidencia. El prompt copiado manda leer primero el `AGENTS.md` de la carpeta.
- La API nunca da la ruta completa de la carpeta, solo su nombre. Por eso la ruta que verá el agente se escribe a mano en opciones (`agentPath`) y se usa en el prompt (`SieCarpeta.prompt`).

## Probar sin SmartIT

```
python3 tests/make_pages.py
```

Genera `tests/out/<fixture>.html` (ignorado por git) a partir de `viewer.html`, con un sustituto mínimo de `chrome.*` y los datos de `tests/fixtures/`. Ábrelos en Chrome o con Playwright:

- `ejemplo.js`: incidencia corta con capturas en la descripción.
- `largo.js`: once cambios de equipo (metro en dos filas), dos reaperturas, resumen de HelixGPT y casos de menciones engañosas.

Para cambiar el estilo o el tema en una prueba, pon `document.documentElement.dataset.style = 'classic'` y `dataset.theme = 'dark'`.

La capa de carga (`top.js`) se probó con una página que imita la cabecera de SmartIT y un iframe que responde a `export` con mensajes `progress` simulados. Para eso hay que permitir el origen local en la comprobación de `isOnbmc`, y solo en la copia de prueba.

Antes de entregar: `node --check` sobre los .js, revisar las cuatro combinaciones de estilo y tema, y comprobar que no hay errores en la consola.
