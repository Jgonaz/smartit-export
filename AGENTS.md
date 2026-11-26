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
| `explorar.html/.js/.css` | Pestaña de la extensión | «Ver guardadas»: lee el índice de la carpeta elegida (o lo crea) y muestra cada incidencia: resumen de la clasificación, archivos, adjuntos e `incidencia.md` renderizado (plegado). Filtros rápidos (abiertas, cerradas, documentadas, sin clasificar), etiquetas y orden (guardada, abierta, número). Ocupa el alto de la ventana y solo se desplazan la lista y el detalle. Permite eliminar una o varias incidencias tras una ventana de confirmación (`SieCarpeta.remove`). Chrome no deja abrir el explorador de archivos desde una extensión. |
| `carpeta.js`, `offscreen.html/.js` | Opciones y documento oculto | Guardan la referencia a la carpeta en IndexedDB y escriben los archivos. |

### Mensajes entre marcos (`postMessage`, campo `sie`)

- Ficha → página: `ready` (cada 700 ms, indica si la ficha ya cargó; el icono solo aparece entonces y si la URL es de una ficha `#/…PV/…`).
- Página → ficha: `export`. Respuestas: `started`, `progress` (texto, `page`/`total` al leer páginas), `done` (con el id de la exportación) o `error`. Si pasan unos segundos sin progreso al leer páginas, `top.js` va rotando frases de espera para que no parezca colgado.
- Visor → página: `viewer-ready` (ya pintado, se muestra con la animación), `viewer-close` (Esc), `update-dismissed`.
- `top.js` solo acepta mensajes de orígenes `*.onbmc.com`.
- Al recargar o actualizar la extensión, el `top.js` de las pestañas ya abiertas sigue vivo pero desconectado (cualquier `chrome.*` lanza «Extension context invalidated»). `alive()` lo detecta antes de cada llamada y `shutdown()` para los temporizadores y quita el icono en silencio; al recargar la página vuelve con la versión nueva.

### Visor incrustado

El visor se carga en un iframe con `chrome.runtime.getURL('viewer.html')#<id>`. Para ello `viewer.html/js/css`, `theme.js` y `fonts/*` están en `web_accessible_resources` (solo para `https://*.onbmc.com/*`). El iframe lleva `allow="clipboard-write"` para que funcionen «Copiar prompt» y «Copiar Markdown». SmartIT no puede leer el contenido del iframe porque es de otro origen. No se usa `use_dynamic_url` por compatibilidad. Al cerrar, el visor se guarda en caché para reabrirlo al instante si no cambia la incidencia.

## SmartIT por dentro (Helix Progressive Views)

La ficha de la incidencia vive en un iframe (`/arsys/pwa/…`), no en la página de SmartIT.

- **Campos:** pares `#ar<ID>_label` / `#ar<ID>_data`. Puede haber varios elementos con el mismo id: hay que usar `querySelectorAll('[id="ar<ID>_data"]')`.
- **Actividad:** celdas `smt-table-cell-field`. Cada nota es un iframe `iframe[id^="VFWLG"]` con `#content_block` (texto), `#date-block` y `#first-attachement-name` (sic) para el primer adjunto.
- **Paginación:** botones `[data-testid$="-pagination_right"]` / `_left`. El texto de estado está en un `[aria-live]`, del tipo "Registros desde 1 hasta 15 de 110". De ahí se calcula el total de páginas para el anillo "X/Y".
- **Resumen de HelixGPT:** `.helixGptChat-summary-response-content` (se lee completo aunque no se haya pulsado "Mostrar más"), autor en `#summaryGeneratedBy_data` y fecha en `.helixGptChat-summary-right-button-group`. Se convierte a un Markdown sencillo (listas anidadas y negritas).
- **Pestaña en segundo plano:** Chrome retrasa mucho los temporizadores de las pestañas ocultas (hasta una vez por minuto). Por eso `waitFor()` en `content.js` vuelve a comprobar al cambiar el DOM (MutationObserver, también dentro de los iframes de las notas) y no solo con `setTimeout`. Por lo mismo, las animaciones de la capa de carga son CSS y no dependen de temporizadores.
- **Siguiente SLA:** SmartIT lo muestra junto a la barra de progreso de la cabecera como texto, "El siguiente SLA es 27/11/2026 9:27:56". `collectNextSla()` lo busca como campo de la ficha (`#ar<ID>_label` con ese texto y el valor en `_data`, aunque esté en un `<input>`), como texto repartido en elementos cercanos, en shadow DOM abiertos y en iframes de la misma web; lo guarda en `header.sla`. Si no lo encuentra, deja en la consola de la ficha un aviso «[SmartIT export] No se encontró la fecha del siguiente SLA» con el HTML cercano a cada texto «SLA», para ajustar la búsqueda.
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
- **Estado y siguiente SLA:** el estado es una ficha junto al número, con un color por estado (Nuevo azul, Asignado lila, En curso amarillo, Pendiente rosa, Resuelto verde, Cerrado gris, Cancelado con borde discontinuo); ya no va en la frase de debajo del título. La clase es `hchip` porque `.chip` ya se usa para las menciones a adjuntos. El siguiente SLA va arriba de la tarjeta Tiempo (`#sla-block`): cuánto queda, la fecha y una barra con la parte del plazo consumida desde la creación, actualizado cada minuto. Color según la parte del plazo que queda: más de la mitad, verde; menos de la mitad, amarillo; menos del 15 % o de 1 hora, naranja; vencido, rojo. En Pendiente, "en pausa" en gris; en Resuelto, Cerrado o Cancelado no se muestra.
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
- **Markdown para el agente:** `buildText()` genera el Markdown de «Copiar Markdown» (y de «Copiar prompt» sin guardar) y el `incidencia.md` que se guarda.
- **Sugerencias de etiquetas:** lista propia (`#tag-sugg`, combobox accesible) en lugar del `datalist` nativo, que no se puede estilar: etiquetas que ya usas con su color (primero las que empiezan por lo escrito), «Crear «…»» para una nueva, flechas, Enter y Esc.
- **Menú «Opciones»:** Ayuda y Ajustes son ventanas modales. La Ayuda va en apartados plegables (`details name="help"`, solo uno abierto a la vez, el primero abierto al empezar, con animación al plegar y desplegar mediante `::details-content` e `interpolate-size`) para que no abrume al abrirla: qué se guarda, qué pasa al volver a guardar, qué archivos puede tocar el agente (tabla), por qué hay `indice.md` e `indice.jsonl`, cómo se calculan las Relacionadas, estado y SLA, prompt y Ver guardadas. Si cambia alguna de esas reglas, actualiza también la Ayuda; «Ver guardadas» solo aparece si hay carpeta elegida y abre `explorar.html` en una pestaña.

### Guardado automático en una carpeta

- **Siempre se guarda.** No hay botón «Guardar»: el visor guarda la incidencia completa al abrirla (cada export nuevo; al reabrir desde la caché no). El icono de sincronización (`#sync`, a la izquierda de «Opciones») es solo un icono mientras todo va bien y solo se comporta como botón en `error` y `off`. Los cambios de etiquetas se guardan solos, agrupados (~0,8 s), con `tags-update` → `SieCarpeta.updateTags()`: aplica lo añadido/quitado sobre lo que haya en `clasificacion.md` (no sustituye la lista, para no pisar lo que haya puesto el agente), actualiza la lista de etiquetas del frontmatter de `incidencia.md` (el índice suma ambas) y regenera el índice; no toca el resto de `incidencia.md` ni los adjuntos. Antes del guardado inicial se esperan las etiquetas leídas de la carpeta (`tagsReady`).
- Estados del icono (`data-state`): `saving` (gira desde el primer momento, también mientras se agrupan cambios de etiquetas, hasta `ok` o `error`), `ok` (check; el texto dice dónde y cuándo), `error` (alerta; `no-folder` / `permission` / error), `off` («Ahora no»). Al pulsarlo (solo en `error`/`off`): si falta carpeta o permiso, abre `options.html?setup=1` y guarda al recibir `folderReady`; si no, reintenta.
- **Configuración inicial** (`top.js`): al pulsar el icono de la extensión, si no hay carpeta con permiso (`folder-status`) o falta `agentPath`, la capa muestra un panel en vez de la carga: carpeta (el botón abre `options.html?setup=1`, porque el selector de Chrome no se abre dentro de SmartIT; esa ventanita guarda `folderReady` al terminar y se cierra sola) y ruta para el agente (se rellena con el nombre de la carpeta). «Empezar» solo se activa con las dos cosas; «Ahora no» abre el visor sin guardar (`viewer.html#<id>&nosave`). Con permiso «Permitir esta vez», el panel vuelve a salir en la siguiente sesión con «Dar permiso».

- Se usa la API de acceso a archivos (`showDirectoryPicker`), no la de descargas: con "Preguntar dónde guardar" activado en Chrome, la API de descargas sigue mostrando el cuadro y solo escribe dentro de Descargas.
- La carpeta se elige en `options.html`, porque Chrome no deja abrir el selector desde un marco de otro origen (el visor incrustado en SmartIT). La referencia (`FileSystemDirectoryHandle`) se guarda en IndexedDB (`sie-carpeta`).
- La escritura la hace `offscreen.html` (documento oculto creado por `background.js`), que es de la extensión y no está dentro de SmartIT. Si no hay carpeta o falta permiso, responde `no-folder` / `permission` y el visor lo muestra en el icono de sincronización.
- Permiso: Chrome ofrece "Permitir en cada visita" (permiso persistente). Con "Permitir esta vez" habrá que volver a darlo en otra sesión.
- **Etiquetas e índice** (`carpeta.js`):
  - `incidencia.md` empieza con un bloque YAML (frontmatter) con los datos de la ficha (servicio, categorías, equipos, estado, etiquetas…). Lo genera `frontmatter()` en `viewer.js`.
  - `clasificacion.md` guarda etiquetas, causa, solución, y, opcionalmente, si está documentada en otra herramienta (`documentacion`: pendiente | no-necesaria | documentada, `documentacion_url`, `documentacion_fecha`), además de notas libres. La extensión no depende de ninguna herramienta de documentación: solo muestra esos campos si existen. Un agente puede añadir más claves (clasificación del equipo); se conservan. Lo mantienen la persona y el agente: la extensión solo toca las etiquetas (en el guardado completo, la lista leída de la carpeta al abrir —`tagsLoaded`— o, si no se pudo leer, la suma; en los cambios desde el visor, solo lo añadido o quitado).
  - `diagnostico.md` (o cualquier otro archivo del agente en la carpeta de la incidencia) no se toca al volver a guardar: solo se reescriben `incidencia.md` y `adjuntos/`.
  - En la raíz: `indice.md` e `indice.jsonl` (la columna «Documentación» solo aparece si alguna incidencia la usa) se rehacen leyendo todas las incidencias (así siguen completos aunque varias personas guarden en una carpeta compartida). `etiquetas.md` es el vocabulario: las etiquetas nuevas se añaden en «Sin describir» sin tocar lo escrito.  La extensión no escribe instrucciones para agentes en la carpeta: eso es cosa de cada equipo (sus skills o su propio `AGENTS.md`).
  - **Eliminar** (`SieCarpeta.remove`, desde «Ver guardadas»): borra del todo la carpeta de cada incidencia, con lo que haya dejado el agente, y regenera el índice. Solo acepta subcarpetas directas con un `incidencia.md`. No hay papelera: Chrome no puede mandar archivos a la del sistema, por eso se pide confirmación. `etiquetas.md` no se toca. El índice incluye `guardada` para ordenar por fecha de guardado; los índices antiguos sin ese campo se rehacen al abrir la página.
  - Colores de etiqueta: cada etiqueta nueva recibe el primer color libre de la paleta (10 tonos) y, cuando se acaban, el menos usado. La asignación se guarda en `chrome.storage.local.tagColors`, así una etiqueta conserva su color.
  - El visor pide `tags-info` para sugerir etiquetas, cargar las de la incidencia (de `clasificacion.md`), la fecha del último guardado (`guardada` de `incidencia.md`; en «Ver guardadas» se muestra como «Actualizada») y el estado de la documentación (`documentacion`, `documentacion_url`, `documentacion_fecha`), que se muestra bajo los botones: «Documentada el …», «Documentación en curso» (pendiente con URL) o «No requiere documentación», y `related` para la tarjeta «Relacionadas». `SieCarpeta.related()` puntúa con el índice: 3 puntos por etiqueta en común, 2 por misma categoría, 2 por mismo servicio o activo (salvo que ese valor aparezca en más del 60 % de las incidencias, con al menos 5: entonces no distingue y no suma) y 1 por palabra del título en común (máximo 3). Muestra las de 3 puntos o más, con su causa y solución.
  - «Copiar prompt»: guardada → prompt con rutas; sin guardar («Ahora no» o error) → Markdown con un aviso de cómo guardarla. En estados finales (`isClosedStatus`) abre un menú: «Documentar» (`promptDocTemplate`; sin guardar, explica cómo guardarla) o «Investigar» (`promptTemplate`). Si aún se está guardando un cambio, copia igual y avisa. El selector Vista / Markdown va pegado al título y el cambio se anima (`mode-in`). Los eventos automáticos se muestran siempre (ya no hay casilla para ocultarlos). «Copiar Markdown» solo se ve en la vista Markdown, a la derecha del selector (el título pasa de «Conversación» a «Información»), y su aviso sale abajo y centrado (`toast(..., { bottom: true })`). Todos los avisos tienen una «x» para cerrarlos (`hideToast()`), y al abrir el menú de «Copiar prompt» se oculta el aviso que hubiera para que no lo tape. «Ver guardadas» tiene el mismo «Copiar prompt», con el menú en las finalizadas.
  - Plantillas editables en las opciones (`promptTemplate`, `promptDocTemplate`; vacías = las de por defecto, `DEFAULT_PROMPT` y `DEFAULT_DOC_PROMPT`) con `{incidencia}`, `{titulo}`, `{carpeta}` y `{raiz}`. Las de por defecto no mencionan ninguna herramienta concreta.
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
