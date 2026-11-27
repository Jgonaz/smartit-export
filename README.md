# SmartIT – Exportar incidencia

![Icono de exportar en la cabecera de SmartIT, a la izquierda de la lupa](docs/icono-cabecera.png)

Extensión de Chrome para **BMC Helix SmartIT** que reúne en una sola pantalla toda la información de una incidencia.

Actualmente, la actividad de SmartIT está paginada y no se puede copiar entera con Ctrl+C / Ctrl+V y los adjuntos solo están disponibles al descargar. Este panel soluciona ese problema de UX.

![Visor de una incidencia de ejemplo: recorrido entre equipos, conversación, tiempos y archivos](docs/visor.png)

## Instalación

1. Descarga el .zip
2. Abre `chrome://extensions` y activa el **Modo de desarrollador**.
3. Pulsa **Cargar descomprimida** y elige la carpeta del repositorio.
4. Recarga SmartIT.

## Uso

Abre una incidencia y pulsa el icono 📋 de la cabecera de SmartIT, a la izquierda de la lupa. La primera vez aparece un panel para elegir la carpeta donde se guardarán las incidencias y la ruta con la que la ve tu agente («Ahora no» abre el visor sin guardar). El contenido de SmartIT se funde a blanco mientras se analiza la incidencia y el visor aparece en su lugar, dentro de la propia página. Para volver a SmartIT, pulsa el icono de nuevo (ahora es una flecha circular) o Esc:

- Guardado automático: cada incidencia que abres se guarda sola en tu carpeta, y se vuelve a guardar al cambiar sus etiquetas. El icono a la izquierda de «Opciones» indica el estado (guardando, guardada o error); si falla, se convierte en botón para reintentarlo. «Eliminar de la carpeta», al final del menú Opciones, borra una incidencia guardada (por ejemplo, si solo querías leerla) y recuerda no volver a guardarla salvo que pulses el icono.
- «Copiar prompt»: copia un prompt con la ruta de la carpeta de la incidencia y sus adjuntos para el agente; si no se pudo guardar, la incidencia en Markdown (sin imágenes). En las finalizadas pregunta si quieres «Documentar» o «Investigar», cada una con su prompt (editables en las opciones). El selector Vista / Markdown, junto al título, muestra ese texto; en la vista Markdown, «Copiar Markdown» copia siempre la incidencia completa, con los eventos automáticos (cambios de estado, asignaciones…).
- Si la incidencia tiene un resumen de HelixGPT, se muestra completo al principio de la conversación y se incluye al principio del Markdown.
- «Opciones» (arriba a la derecha del visor): Ayuda (qué archivos se guardan y qué contiene cada uno), Ajustes (tema, estilo «Tarjetas» o «Clásico» y carpeta) y Ver guardadas (las incidencias guardadas, con buscador, filtros por estado y etiquetas, orden y detalle de cada una; «Abrir en el panel» las muestra en el visor a pantalla completa sin pasar por SmartIT; desde ahí se pueden eliminar una o varias, con su carpeta y su rastro en el índice, tras confirmar, y quitar del vocabulario las etiquetas que no usa ninguna).
- Junto al número de la incidencia, su estado con un color por estado. Arriba de la tarjeta Tiempo, el siguiente SLA: cuánto queda, la fecha y una barra con la parte del plazo consumida, en verde, amarillo, naranja o rojo según lo cerca que esté (en Pendiente, «en pausa»; en las cerradas no se muestra).
- Etiquetas: debajo del título puedes añadir etiquetas (con sugerencias de las que ya usas). Se guardan solas en su `clasificacion.md`, sin pisar las que haya añadido el agente.
- Relacionadas: en el lateral, las incidencias ya guardadas en tu carpeta que se parecen a la actual (etiquetas, servicio, categoría o título en común), con su causa y solución si están anotadas.
- Qué se guarda: `<incidencia>/incidencia.md`, `<incidencia>/datos.json` (lo que usa el visor para abrirla sin SmartIT) y los adjuntos en `<incidencia>/adjuntos/`, enlazados desde el Markdown, para pasársela a tu agente (Copilot CLI u otro) con «Copiar prompt». En la raíz de esa carpeta mantiene un `indice.md` de todas las incidencias guardadas (etiquetas, servicio, equipo, solución), un vocabulario `etiquetas.md` y, en cada incidencia, un `clasificacion.md` con etiquetas, causa y solución. La carpeta se elige la primera vez; se puede cambiar en los ajustes de la extensión, donde también se indica la ruta tal como la ve el agente (por ejemplo, desde WSL) y se pueden adaptar los prompts que se copian (Investigar y Documentar).
- El recorrido de la incidencia entre equipos, con el tiempo en cada uno, dónde se cerró, se reabrió y dónde está ahora.
- La actividad como una conversación, con los tiempos sin actividad, y en el lateral el tiempo por equipo, los adjuntos y la ficha.

## Cómo funciona

| Archivo | Qué hace |
|---|---|
| `top.js` | En la página de SmartIT añade el icono de la cabecera y avisa al iframe de la ficha. |
| `content.js` | En la ficha (Helix Progressive Views) lee los campos, recorre las páginas de la actividad y carga los adjuntos. |
| `main-hook.js` | Observa (sin modificarlas) las peticiones que hace la propia aplicación para reutilizar su cabecera de sesión al pedir los adjuntos. |
| `background.js` | Guarda la exportación, abre el visor y pasa los archivos a guardar a `offscreen.html`. |
| `explorar.html` / `explorar.js` / `explorar.css` | «Ver guardadas»: lista, muestra y elimina las incidencias guardadas. |
| `options.html` / `options.js` | Ajustes de la extensión: carpeta donde guardar y ruta para el agente. |
| `carpeta.js` / `offscreen.html` | Escriben en la carpeta elegida (API de acceso a archivos de Chrome). |
| `viewer.html` / `viewer.js` / `viewer.css` | El visor local. |
| `tests/` | Datos inventados y un generador de páginas para probar el visor sin SmartIT. |

## Privacidad y seguridad

Todo ocurre en local, en tu navegador:

- La extensión no envía datos a ningún servidor externo ni usa analítica. Las únicas peticiones que hace son a tu propia instancia de SmartIT, con tu sesión, igual que si navegaras tú.
- Es de solo lectura: no crea, modifica ni borra nada en SmartIT. Lo único que pulsa son los botones de paginación de la actividad.
- No guarda contraseñas ni tokens. La cabecera de sesión se toma en el momento de las peticiones de la propia página y no se almacena.
- El guardado automático solo escribe dentro de la carpeta que tú elijas, con el permiso que concedes en Chrome. La extensión no conoce la ruta completa de esa carpeta, solo su nombre.
- Una vez al día, como mucho (se puede desactivar en los ajustes de la extensión), descarga el `manifest.json` público de este repositorio para avisar si hay una versión nueva. No envía ningún dato.
- El visor es una página de la propia extensión que se muestra dentro de SmartIT en un marco aislado: SmartIT no puede leer su contenido. Las exportaciones se guardan en el almacenamiento local de la extensión (solo las 10 más recientes) para poder mostrarlas.

## Para quien contribuya

Sube el número de `version` del `manifest.json` en cada cambio que publiques: es lo que usa la extensión para avisar de que hay una versión nueva.

## Licencia

MIT
