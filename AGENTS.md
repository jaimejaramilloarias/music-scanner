# AGENTS – Webapp OMR (Imagen → MusicXML desde GitHub)

Este documento describe una app web sencilla alojada en **GitHub** que:

1. Permite subir una imagen de una partitura (tipo Real Book, manuscrita limpia).
2. Envía la imagen a un backend.
3. El backend ejecuta un motor OMR (por ejemplo Audiveris) para:
   - Detectar pentagramas, notas y símbolos.
   - Reconstruir la partitura.
   - Exportar el resultado como **MusicXML**.
4. Devuelve al navegador el archivo MusicXML generado para que el usuario lo descargue.

La app está pensada para que el **frontend se sirva directamente desde GitHub Pages**.  
El backend puede ejecutarse en cualquier hosting (Railway, Render, VPS propio, Codespaces, etc.); lo único que debe cumplir es exponer la API que se describe aquí.

La app es intencionadamente simple: una sola página HTML estática servida por GitHub Pages + un backend mínimo desplegado aparte.


---

## 1. Arquitectura propuesta

### Frontend (GitHub Pages)
- **Tecnología:** HTML + CSS + JavaScript puro (sin frameworks).
- **Ubicación en el repo:** carpeta `docs/` (para GitHub Pages estándar) o rama `gh-pages`.
- **Funcionamiento:**
  - Campo de subida de archivo (`<input type="file">`).
  - Botón “Procesar partitura”.
  - Petición `POST` al backend con el archivo (fetch + `FormData`).
  - Zona de estado (esperando / procesando / error).
  - Enlace de descarga del resultado (MusicXML).

- **Configuración:**  
  - En GitHub, activar **GitHub Pages** apuntando a `docs/` en la rama principal.  
  - La URL del backend se configurará mediante una variable JS sencilla o mediante un archivo de configuración (`config.js`) que contenga, por ejemplo:
    ```js
    const OMR_API_BASE_URL = "https://TU_BACKEND/";
    ```

### Backend (fuera de GitHub Pages)
- **Tecnología sugerida:** Python + FastAPI (o Flask) – elegir una y ser consistente.
- **Responsabilidades:**
  - Endpoint `POST /api/omr` que reciba la imagen.
  - Guardar el archivo en un directorio temporal.
  - Invocar al motor OMR (por ejemplo **Audiveris** vía CLI).
  - Esperar a que termine y localizar el MusicXML generado.
  - Devolver al cliente:
    - el archivo MusicXML como descarga directa **o**
    - una URL para descargarlo en un endpoint separado (`GET /files/...`).

- **Suposiciones:**
  - Audiveris ya está instalado en el sistema donde corre el backend y accesible vía línea de comandos.
  - El backend tiene permisos de escritura en un directorio temporal.
  - Se pueden ejecutar procesos externos (por ejemplo con `subprocess`).

---

## 2. Flujo de uso

1. El usuario abre la página hospedada en GitHub Pages.
2. Selecciona una imagen de partitura (PNG/JPG o PDF de una página).
3. Pulsa “Procesar partitura”.
4. El frontend hace `POST {OMR_API_BASE_URL}/api/omr` con el archivo.
5. El backend:
   - guarda el archivo,
   - lanza Audiveris,
   - obtiene MusicXML,
   - devuelve una respuesta con:
     - `status = "ok"`,
     - la URL o un link directo al archivo MusicXML.
6. El frontend:
   - muestra un enlace de descarga para el MusicXML.

No se genera ni se maneja ningún archivo MIDI: **el único resultado es MusicXML**.

---

## 3. Requisitos funcionales

- Subir una imagen (tamaño razonable).
- Aceptar al menos PNG y JPG; opcionalmente PDF.
- Procesar un archivo a la vez.
- Devolver siempre un **MusicXML** descargable cuando la conversión tiene éxito.
- Manejo básico de errores:
  - archivo no válido,
  - error al ejecutar Audiveris,
  - timeout de procesamiento.
- Interfaz sencilla y comprensible sin documentación adicional.
- El frontend debe funcionar directamente desde GitHub Pages sin necesidad de compilación.

---

## 4. Requisitos no funcionales

- Código lo más simple posible.
- No usar frameworks pesados de frontend.
- Mantener la app en:
  - un HTML estático en `docs/index.html`,
  - un JS simple en `docs/app.js`,
  - un CSS simple en `docs/style.css`.
- Backend organizado en módulos claros (rutas, lógica OMR, utilidades).
- Fácil de lanzar en local y de desplegar en el proveedor elegido.

---

## 5. Tareas incrementales para desarrollar la app

> Cada bloque de tareas debería completarse y probarse antes de pasar al siguiente.

### Fase 0 – Preparación del repositorio en GitHub

1. Crear un repositorio en GitHub llamado, por ejemplo, `omr-webapp`.
2. Añadir este archivo `AGENTS.md` en la raíz del repo.
3. Crear carpetas iniciales:
   - `docs/` para el frontend,
   - `backend/` para el servidor de la API.
4. Activar **GitHub Pages** en la configuración del repositorio:
   - Source: rama `main`,
   - Carpeta: `/docs`.

---

### Fase 1 – HTML estático básico (docs/)

1. Crear `docs/index.html` con:
   - título de la página,
   - `<input type="file" id="scoreFile">`,
   - botón “Procesar partitura”,
   - `<div id="status"></div>` para mensajes,
   - `<div id="results"></div>` para el enlace de descarga.
2. Crear `docs/style.css` con estilos simples (centrar el formulario, botones visibles, etc.).
3. Crear `docs/app.js` y enlazarlo desde el HTML.
4. Crear opcionalmente `docs/config.js` con la constante `OMR_API_BASE_URL` y cargarlo antes de `app.js`.
5. Hacer commit y push a GitHub; comprobar que GitHub Pages sirve correctamente `https://TU_USUARIO.github.io/omr-webapp/`.

---

### Fase 2 – Backend mínimo + endpoint de salud

1. En `backend/`, inicializar el proyecto para FastAPI (o Flask):
   - crear `backend/requirements.txt` con las dependencias mínimas (por ejemplo `fastapi`, `uvicorn`).
2. Crear `backend/main.py` con:
   - una app FastAPI,
   - endpoint `GET /api/health` que devuelva `{ "status": "ok" }`.
3. Probar localmente:
   - `python -m venv venv`,
   - activar entorno,
   - instalar dependencias,
   - `uvicorn main:app --reload`.
4. Configurar CORS para permitir peticiones desde el dominio de GitHub Pages.
5. Actualizar `docs/config.js` para apuntar a la URL local o de despliegue del backend.

---

### Fase 3 – Subida de archivo desde el frontend

1. En `docs/app.js`, implementar la función que:
   - lea el archivo seleccionado en `#scoreFile`,
   - valide que existe,
   - cree un `FormData` con campo `file`,
   - haga `fetch(OMR_API_BASE_URL + "/api/omr", { method: "POST", body: formData })`,
   - muestre mensajes de “subiendo/esperando respuesta” en `#status`.
2. En el backend, implementar endpoint `POST /api/omr` que:
   - reciba el archivo (campo `file`),
   - valide que existe y que no está vacío,
   - por ahora no llame a Audiveris, solo:
     - guarde el archivo en una carpeta temporal,
     - devuelva un JSON con `{ "status": "received", "filename": "...", "size": ... }`.
3. Probar desde la página GitHub Pages (apuntando al backend en local o remoto) que:
   - se puede subir un archivo,
   - la respuesta JSON se recibe y muestra en la UI.

---

### Fase 4 – Integración con Audiveris (MusicXML)

1. En `backend/`, crear módulo `omr_service.py` con función:
   - `run_omr(input_path: str) -> dict`  
     que:
     - invoque Audiveris por CLI (p.ej. `audiveris -batch -export <input>`),
     - espere a que termine,
     - localice el archivo MusicXML generado,
     - devuelva la ruta del MusicXML o lance excepción si falla.
2. Modificar `POST /api/omr` para que:
   - después de guardar el archivo subido, llame a `run_omr`,
   - copie o mueva el MusicXML generado a un directorio de salida accesible (por ejemplo `backend/output/`),
   - genere un identificador o nombre de archivo único para ese resultado.
3. Crear endpoint `GET /files/musicxml/{id}` que:
   - sirva el archivo MusicXML correspondiente como descarga (`Content-Type: application/vnd.recordare.musicxml+xml` o `application/xml`),
   - devuelva 404 si no existe.
4. Cambiar la respuesta de `POST /api/omr` para que devuelva:
   - `status: "ok"`,
   - `musicxml_url: "<URL_COMPLETA_AL_ARCHIVO>"`.

---

### Fase 5 – Mostrar enlace de descarga en el frontend

1. En `docs/app.js`, al recibir la respuesta exitosa de `POST /api/omr`:
   - limpiar `#results`,
   - crear un enlace `<a>` apuntando a `response.musicxml_url`,
   - texto del enlace: “Descargar MusicXML”.
2. Actualizar `#status` para indicar que el proceso ha finalizado correctamente.
3. Probar el flujo completo:
   - subir una imagen real,
   - esperar al procesamiento,
   - descargar el MusicXML generado,
   - abrir el MusicXML en un editor de partituras (MuseScore, etc.) para verificar que es válido.

---

### Fase 6 – Manejo de errores y validaciones

1. En el frontend:
   - validar tipo de archivo (extensiones permitidas: `.png`, `.jpg`, `.jpeg`, `.pdf`),
   - validar tamaño máximo (por ejemplo, 10 MB),
   - mostrar mensajes claros si la validación falla.
2. En el backend:
   - manejar errores de archivo faltante o vacío,
   - capturar excepciones al ejecutar Audiveris y devolver un JSON:
     - `status: "error"`,
     - `message: "Descripción legible del problema"`.
3. Normalizar todas las respuestas de error para que el frontend pueda tratarlas de forma uniforme.
4. En el frontend, detectar `status: "error"` y mostrar `message` en `#status` con un estilo de error.

---

### Fase 7 – Limpieza, estilos y documentación

1. Refinar `docs/style.css` para mejorar la presentación:
   - centrar el contenido,
   - mejorar tipografía,
   - estilos separados para estados “ok” y “error”.
2. Revisar y limpiar el código de `docs/app.js`:
   - extraer funciones auxiliares si es necesario,
   - evitar duplicación de lógica.
3. En el backend:
   - separar rutas, servicios y utilidades en módulos claros,
   - documentar brevemente cada función clave.
4. Actualizar `README.md` en la raíz para explicar:
   - cómo clonar el repo,
   - cómo configurar GitHub Pages,
   - cómo configurar la URL del backend en `config.js`,
   - cómo instalar y ejecutar el backend y Audiveris.

---

## 6. Extensiones futuras (opcionales)

- Soporte para PDFs multipágina con selección de página.
- Historial de conversiones (lista de archivos procesados en la sesión actual).
- Configuración avanzada de OMR (modo manuscrito/impreso, parámetros extra de Audiveris).
- Interfaz para previsualizar el MusicXML renderizado en el navegador usando una librería como Verovio.

---
