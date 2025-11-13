// URL base del backend OMR.
// Sustituye el valor por la URL real cuando despliegues el servidor.
const OMR_API_BASE_URL = "http://localhost:8000";

// Configuración de los modos de procesamiento disponibles en el frontend.
// Puedes personalizar las etiquetas o añadir/retirar modos según lo que
// ofrezca tu despliegue del backend.
const OMR_PROCESSING_MODES = [
  { value: "auto", label: "Automático" },
  { value: "printed", label: "Impreso" },
  { value: "handwritten", label: "Manuscrito" },
];
