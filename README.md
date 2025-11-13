# Music Scanner – Conversor OMR a MusicXML

Este repositorio contiene una aplicación sencilla que permite convertir imágenes de partituras en archivos MusicXML mediante un backend basado en FastAPI. El frontend se aloja en GitHub Pages y consume la API del backend para gestionar el procesamiento OMR.

## Estructura del proyecto

- `docs/`: archivos estáticos del frontend (HTML, CSS y JavaScript) servidos por GitHub Pages.
- `backend/`: aplicación FastAPI con los endpoints necesarios para recibir archivos, ejecutar el motor OMR y entregar los resultados.
- `tareas.md`: lista de tareas planificadas para el desarrollo incremental.

## Requisitos previos

- Python 3.10 o superior.
- Acceso a un comando de Audiveris instalado en el entorno donde se ejecutará el backend (opcional si se usa el modo "stub").
- Node/npm **no** son necesarios; el frontend es JavaScript plano.

## Configuración del backend

1. Crear un entorno virtual y activar:
   ```bash
   cd backend
   python -m venv .venv
   source .venv/bin/activate  # En Windows usa `.venv\Scripts\activate`
   ```
2. Instalar dependencias:
   ```bash
   pip install -r requirements.txt
   ```
   - Las dependencias incluyen `pypdf`, utilizada para extraer páginas individuales de PDFs multipágina.
3. Definir las variables de entorno necesarias (pueden ir en un archivo `.env` en la carpeta `backend/`):
   ```env
   OMR_ALLOWED_ORIGINS=https://tuusuario.github.io/omr-webapp/,https://tu-dominio.com
   OMR_PUBLIC_BASE_URL=https://tu-backend.example.com
   OMR_AUDIVERIS_COMMAND="/ruta/a/audiveris -batch"
   OMR_ENABLE_STUB_OMR=true
   OMR_DEFAULT_PROCESSING_MODE=auto
   OMR_AUDIVERIS_PROCESSING_PRESETS={"auto": [], "printed": ["--engine", "printed"], "handwritten": ["--engine", "handwritten"]}
   ```
   - `OMR_ALLOWED_ORIGINS`: lista separada por comas con los orígenes autorizados para CORS.
   - `OMR_PUBLIC_BASE_URL`: URL pública del backend (se usa para construir los enlaces de descarga).
   - `OMR_AUDIVERIS_COMMAND`: comando completo para ejecutar Audiveris. Si no se indica y `OMR_ENABLE_STUB_OMR=true`, se generará un MusicXML de prueba.
   - `OMR_ENABLE_STUB_OMR`: permite habilitar un resultado ficticio cuando Audiveris no está disponible.
   - `OMR_DEFAULT_PROCESSING_MODE`: modo de procesamiento que se aplicará por defecto al recibir peticiones.
   - `OMR_AUDIVERIS_PROCESSING_PRESETS`: diccionario (JSON) que define los argumentos adicionales para cada modo disponible. Si dejas las listas vacías, el comando base no añadirá parámetros extra.

4. Ejecutar el backend en desarrollo:
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8000 --reload
   ```

### Límite de tamaño y tipos de archivo

- El backend valida que el archivo recibido tenga extensión `.png`, `.jpg`, `.jpeg` o `.pdf`.
- También rechaza archivos mayores a **10 MB** devolviendo una respuesta JSON normalizada con un mensaje claro.

## Configuración del frontend

1. Editar `docs/config.js` y actualizar `OMR_API_BASE_URL` con la URL real del backend.
   - En el mismo archivo puedes ajustar `OMR_PROCESSING_MODES` para que la lista de modos disponibles coincida con los configurados en el servidor.
2. Publicar la carpeta `docs/` mediante GitHub Pages (ramas principales -> carpeta `/docs`).
3. Abrir la página en el navegador, seleccionar una partitura y pulsar **Procesar partitura**.

El frontend valida el tipo y tamaño del archivo antes de enviarlo, muestra estados informativos durante el procesamiento y presenta mensajes de error normalizados si algo falla.

### Soporte para PDFs multipágina

- Cuando se selecciona un PDF, la interfaz muestra un selector para elegir qué página se procesará.
- El navegador intenta detectar automáticamente cuántas páginas tiene el documento (usando PDF.js). Si no puede determinarlo, seguirá permitiendo que se indique manualmente.
- El backend valida el número de página recibido y, si el PDF contiene varias páginas, extrae únicamente la solicitada antes de invocar Audiveris.

### Previsualización integrada del MusicXML

- Tras cada conversión exitosa, la interfaz descarga el MusicXML generado y lo renderiza como partitura usando la librería [Verovio](https://www.verovio.org/).
- El visor incrustado indica la página que se está mostrando y referencia el archivo original cuando se dispone del nombre.
- Si el previsualizador no puede inicializarse, la aplicación mantiene el enlace de descarga para que el usuario abra el MusicXML en su editor preferido.

### Modos de procesamiento avanzados

- El formulario incluye un apartado de **Opciones avanzadas** para escoger entre los modos configurados (`Automático`, `Impreso`, `Manuscrito`).
- También permite especificar argumentos adicionales que se añadirán al comando de Audiveris, útil para activar perfiles personalizados o ajustar parámetros finos.
- El backend valida que el modo solicitado esté habilitado en `OMR_AUDIVERIS_PROCESSING_PRESETS` y refleja tanto el modo como los argumentos aplicados en el archivo MusicXML resultante.

## Flujo completo de uso

1. El usuario abre la página en GitHub Pages.
2. Selecciona un archivo de imagen o PDF (≤ 10 MB).
3. El frontend envía el archivo al backend y muestra el estado del proceso.
4. El backend ejecuta Audiveris (o genera un resultado ficticio) y guarda el MusicXML en `backend/output/`.
5. Para PDFs multipágina, el backend sólo procesa la página solicitada.
6. La respuesta JSON incluye la URL para descargar el MusicXML generado y metadatos con la página procesada.
7. El frontend muestra un botón **Descargar MusicXML** con el identificador del resultado y, en su caso, la página indicada.

## Comprobaciones recomendadas

- Ejecutar `uvicorn` en local y comprobar `GET /api/health` y `POST /api/omr` usando la página del frontend o herramientas como `curl`/`HTTPie`.
- Revisar los archivos generados en `backend/output/` para limpiar periódicamente resultados antiguos.
- Configurar HTTPS en el backend si se despliega públicamente.

## Pruebas automatizadas

- Instalar las dependencias de desarrollo (por ejemplo, `pip install pytest`).
- Ejecutar `pytest` dentro de la carpeta `backend/` para validar el flujo extremo a extremo simulado con el stub de Audiveris.

## Licencia

Este proyecto se distribuye con fines educativos. Ajusta la licencia según las necesidades de tu despliegue.
