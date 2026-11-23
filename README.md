# SmartIT – Exportar incidencia

![Icono de exportar en la cabecera de SmartIT, a la izquierda de la lupa](docs/icono-cabecera.png)

Extensión de Chrome para **BMC Helix SmartIT** (vista Helix Progressive Views) que reúne en una sola pantalla toda la información de una incidencia:

- **Adjuntos** en un carrusel, sin tener que descargarlos. Al pulsar una imagen se abre a pantalla completa; los PDF y textos se abren en una pestaña nueva. Cada adjunto tiene un botón ⓘ que indica de qué nota sale (tipo, autor, fecha, visibilidad) y su contexto: el comentario de la nota, dónde se menciona el archivo (descripción u otras notas) y las notas escritas en el mismo momento.
- **Toda la incidencia, bien presentada**: cabecera con estado y prioridad, descripción completa (las imágenes que menciona se pueden abrir desde el propio texto), **todas** las páginas de la actividad como línea de tiempo, datos de la ficha y resolución. Si la incidencia ha pasado por varios equipos (3 o más cambios de grupo de soporte), se muestra además su **recorrido entre equipos** en una sola fila a todo el ancho. Un enlace copia todo en **Markdown**, listo para pegar en un agente; también se puede ver el Markdown tal cual antes de copiarlo.

Nace porque la actividad de SmartIT está paginada y ya no se puede copiar entera con Ctrl+C / Ctrl+V, y los adjuntos solo se pueden descargar.

![Visor de una incidencia de ejemplo: adjuntos en carrusel, descripción, actividad y datos de la ficha](docs/visor.png)

*Captura con datos de ejemplo.*

## Instalación

1. Descarga o clona este repositorio.
2. Abre `chrome://extensions` y activa el **Modo de desarrollador**.
3. Pulsa **Cargar descomprimida** y elige la carpeta del repositorio.
4. Recarga SmartIT.

Para actualizar: sustituye los archivos, pulsa ↻ en la tarjeta de la extensión y recarga SmartIT (F5).

## Uso

Abre una incidencia y pulsa el icono 📋 de la cabecera de SmartIT, a la izquierda de la lupa. Se abre una pestaña con el visor:

- **Arriba:** carrusel de adjuntos.
- **Abajo:** la información de la incidencia con formato, con el enlace «Pulsa aquí para copiar el markdown completo», el selector Vista / Markdown y opciones para incluir o quitar los eventos automáticos (cambios de estado, asignaciones…) y los datos de la ficha.

Si abres la vista Helix directamente (sin SmartIT alrededor), aparece en su lugar un botón flotante abajo a la derecha.

## Cómo funciona

| Archivo | Qué hace |
|---|---|
| `top.js` | En la página de SmartIT añade el icono de la cabecera y avisa al iframe de la ficha. |
| `content.js` | En la ficha (Helix Progressive Views) lee los campos, recorre las páginas de la actividad y carga los adjuntos. |
| `main-hook.js` | Observa (sin modificarlas) las peticiones que hace la propia aplicación para reutilizar su cabecera de sesión al pedir los adjuntos. |
| `background.js` | Guarda la exportación y abre el visor. |
| `viewer.html` / `viewer.js` / `viewer.css` | El visor local. |

Funciona con instancias SaaS de BMC Helix alojadas en `*.onbmc.com` que usen la vista Helix Progressive Views.

## Privacidad y seguridad

Todo ocurre en local, en tu navegador:

- La extensión no envía datos a ningún servidor externo ni usa analítica. Las únicas peticiones que hace son a tu propia instancia de SmartIT, con tu sesión, igual que si navegaras tú.
- Es de solo lectura: no crea, modifica ni borra nada en SmartIT. Lo único que pulsa son los botones de paginación de la actividad.
- No guarda contraseñas ni tokens. La cabecera de sesión se toma en el momento de las peticiones de la propia página y no se almacena.
- El visor es una página de la propia extensión. Las exportaciones se guardan en el almacenamiento local de la extensión (solo las 10 más recientes) para poder mostrarlas.

## Licencia

MIT
