# Tareas para el desarrollo progresivo

## Fase 0 – Preparación del repositorio
- [ ] Crear el repositorio en GitHub y activar GitHub Pages apuntando a `docs/`.
- [ ] Confirmar que la página inicial se sirve correctamente desde GitHub Pages.

## Fase 1 – Estructura básica del proyecto
- [x] Crear las carpetas `docs/` y `backend/` con la estructura mínima descrita en `AGENTS.md`.
- [x] Añadir los archivos base del frontend (`index.html`, `style.css`, `app.js`, `config.js`).
- [x] Inicializar el esqueleto del backend con FastAPI y un endpoint de salud.

## Fase 2 – Backend mínimo + endpoint de salud
- [x] Completar la configuración de CORS con los dominios definitivos de GitHub Pages.
- [x] Probar localmente `uvicorn main:app --reload` y verificar `GET /api/health`.

## Fase 3 – Subida de archivo desde el frontend
- [x] Implementar en `app.js` el envío real del archivo mediante `fetch`.
- [x] Añadir en el backend el manejo del archivo recibido y responder con datos de prueba.
- [ ] Validar el flujo completo entre GitHub Pages y el backend en ejecución.

## Fase 4 – Integración con Audiveris (MusicXML)
- [ ] Implementar `run_omr` en `backend/app/services` para invocar Audiveris.
- [ ] Actualizar `POST /api/omr` para devolver la URL del MusicXML.
- [ ] Crear el endpoint de descarga de archivos MusicXML.

## Fase 5 – Mostrar enlace de descarga en el frontend
- [ ] Mostrar el enlace de descarga en `docs/app.js` cuando el backend responda con éxito.
- [ ] Ajustar los mensajes de estado para reflejar el progreso del procesamiento.

## Fase 6 – Manejo de errores y validaciones
- [ ] Implementar validaciones de tamaño y tipo de archivo tanto en frontend como en backend.
- [ ] Normalizar las respuestas de error y mostrarlas en la interfaz.

## Fase 7 – Limpieza, estilos y documentación
- [ ] Mejorar los estilos en `docs/style.css` para estados “ok” y “error”.
- [ ] Documentar la configuración y despliegue en `README.md`.
- [ ] Organizar módulos y añadir documentación en el backend.

## Extensiones futuras (opcionales)
- [ ] Soporte para PDFs multipágina.
- [ ] Historial de conversiones por sesión.
- [ ] Previsualización del MusicXML en el navegador.
