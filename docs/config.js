// Configuración global del frontend. Puedes modificar estos valores antes de
// desplegar la aplicación o sobreescribirlos creando otro archivo que defina
// `window.OMR_CONFIG`.
window.OMR_CONFIG = window.OMR_CONFIG || {};

// URL base del backend OMR. Se define un valor por defecto orientado a los
// despliegues en GitHub Pages para que la aplicación funcione directamente
// desde el enlace público sin necesidad de ajustes manuales. Cuando se
// ejecute en local, la URL cambia automáticamente a ``http://localhost:8000``
// para facilitar el desarrollo.
const DEFAULT_LOCAL_BACKEND_URL = "http://localhost:8000";
const DEFAULT_PRODUCTION_BACKEND_URL = "https://music-scanner-backend.fly.dev";

function isLocalhost(hostname) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".local")
  );
}

if (typeof window.OMR_CONFIG.apiBaseUrl !== "string") {
  window.OMR_CONFIG.apiBaseUrl = isLocalhost(window.location.hostname)
    ? DEFAULT_LOCAL_BACKEND_URL
    : DEFAULT_PRODUCTION_BACKEND_URL;
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
