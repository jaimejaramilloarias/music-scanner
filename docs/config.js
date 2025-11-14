// Configuración global del frontend. Puedes modificar estos valores antes de
// desplegar la aplicación o sobreescribirlos creando otro archivo que defina
// `window.OMR_CONFIG`.
window.OMR_CONFIG = window.OMR_CONFIG || {};

// URL base del backend OMR. Sustituye el valor por la URL real cuando
// despliegues el servidor. Si quieres trabajar sin Audiveris, apunta a un
// backend configurado en modo "stub".
if (typeof window.OMR_CONFIG.apiBaseUrl !== "string") {
  window.OMR_CONFIG.apiBaseUrl = "http://localhost:8000";
}

// Configuración de los modos de procesamiento disponibles en el frontend.
// Puedes personalizar las etiquetas o añadir/retirar modos según lo que
// ofrezca tu despliegue del backend.
if (!Array.isArray(window.OMR_CONFIG.processingModes)) {
  window.OMR_CONFIG.processingModes = [
    { value: "auto", label: "Automático" },
    { value: "printed", label: "Impreso" },
    { value: "handwritten", label: "Manuscrito" },
  ];
}

// Mantenemos compatibilidad con código existente que todavía lea estas
// constantes globales.
window.OMR_API_BASE_URL = window.OMR_CONFIG.apiBaseUrl;
window.OMR_PROCESSING_MODES = window.OMR_CONFIG.processingModes;
