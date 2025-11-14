# Music Scanner – OMR 100 % desde GitHub Pages

Esta versión de **Music Scanner** convierte imágenes sencillas de partituras en archivos **MusicXML** ejecutando todo el
proceso en el navegador gracias a [OpenCV.js](https://docs.opencv.org/4.x/d5/d10/tutorial_js_root.html). No hay servidores,
ni dependencias que instalar en local: basta con abrir la página publicada desde este repositorio y comenzar a trabajar.

> ⚠️ El reconocimiento está optimizado para ejemplos monofónicos impresos con figuras negras. Es un punto de partida que puedes
> ampliar para soportar más símbolos y compases.

## Arquitectura

- **`docs/`** – Contiene el frontend estático servido por GitHub Pages. Incluye:
  - `index.html`: interfaz y carga de librerías externas (OpenCV.js y Verovio).
  - `style.css`: estilos responsive compatibles con modo claro/oscuro.
  - `app.js`: lógica completa de análisis y generación de MusicXML en el navegador.
- **`index.html`** en la raíz redirige automáticamente a la carpeta `docs/` cuando se publica en GitHub Pages.
- Se eliminaron todos los componentes de backend. El repositorio ya no requiere Python ni otras dependencias locales.

## Funcionamiento

1. El usuario abre `https://<usuario>.github.io/music-scanner/` (o la URL configurada para GitHub Pages).
2. Selecciona o arrastra una imagen PNG/JPG (≤ 8 MB).
3. OpenCV.js detecta las líneas de pentagrama, identifica las cabezas de nota y estima su altura relativa.
4. Se genera un MusicXML básico (compás 4/4, valores de negra) que se puede descargar de inmediato.
5. Opcionalmente, la partitura se renderiza en la propia página mediante [Verovio](https://www.verovio.org/).

Todo el procesamiento ocurre en la máquina del usuario. Si la pestaña se cierra, no queda ningún dato en servidores externos.

## Cómo desplegar en GitHub Pages

1. Habilita GitHub Pages en la configuración del repositorio apuntando a la rama principal y a la carpeta `/docs`.
2. Espera a que GitHub procese la publicación. El enlace público servirá automáticamente `docs/index.html`.
3. Comparte el enlace resultante; ningún visitante tendrá que instalar dependencias ni clonar el repo.

## Personalización

- Los estilos están escritos en CSS plano y pueden modificarse en `docs/style.css`.
- El algoritmo de detección vive en `docs/app.js`. Puedes ajustar los parámetros de OpenCV (kernels, umbrales, validaciones) o
  ampliar la lógica para soportar más tipos de notas y compases.
- El previsualizador usa Verovio si está disponible; en caso contrario muestra un mensaje para descargar el MusicXML.

## Desarrollo y pruebas

No se requieren herramientas adicionales para usar la aplicación. Para desarrollarla bastan un navegador moderno y (opcionalmente)
un servidor estático para probar cambios locales. Abre `docs/index.html` directamente o sirve la carpeta con tu herramienta
preferida (por ejemplo, `python -m http.server`).

## Limitaciones conocidas

- Solo admite imágenes PNG/JPG. Si la partitura está en PDF, conviértela previamente a imagen.
- Reconoce mejor partituras con buena resolución, contraste alto y una única voz.
- El MusicXML generado usa compases de 4/4 con figuras de negra. Ajusta `buildMusicXml` en `app.js` para soportar ritmos más
  complejos o silencios.

## Contribuciones

Las mejoras son bienvenidas. Algunas ideas:

- Detectar silencios, ligaduras y puntillos.
- Identificar cambios de compás o clave.
- Añadir pruebas automatizadas usando capturas de pantalla (Playwright/Puppeteer) para validar la detección en imágenes de
  referencia.

Publica tus cambios mediante Pull Requests. ¡Gracias por apoyar un flujo OMR accesible desde cualquier navegador!
