(function () {
  const fileInput = document.getElementById('scoreFile');
  const processButton = document.getElementById('processButton');
  const statusElement = document.getElementById('status');
  const resultsContainer = document.getElementById('results');

  const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
  const ALLOWED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'pdf'];

  function setStatus(message, type = 'info') {
    statusElement.textContent = message;
    statusElement.classList.remove('info', 'error', 'success');
    statusElement.classList.add(type);
  }

  function resetResults() {
    resultsContainer.innerHTML = '<p class="placeholder">Aquí aparecerá el enlace para descargar el MusicXML.</p>';
  }

  function renderDownloadResult(url, originalFilename, resultId) {
    const wrapper = document.createElement('div');
    wrapper.className = 'download-result';

    const info = document.createElement('p');
    info.className = 'download-info';
    info.textContent = originalFilename
      ? `Resultado para “${originalFilename}”`
      : 'Resultado disponible para su descarga';

    const link = document.createElement('a');
    link.className = 'download-link';
    link.href = url;
    link.textContent = 'Descargar MusicXML';
    link.target = '_blank';
    link.rel = 'noopener';

    const identifier = document.createElement('p');
    identifier.className = 'download-id';
    identifier.textContent = resultId ? `ID de referencia: ${resultId}` : '';

    wrapper.appendChild(info);
    wrapper.appendChild(link);
    if (resultId) {
      wrapper.appendChild(identifier);
    }

    resultsContainer.innerHTML = '';
    resultsContainer.appendChild(wrapper);
  }

  function extractErrorMessage(payload, fallback = 'No se pudo procesar la partitura.') {
    if (!payload || typeof payload !== 'object') {
      return fallback;
    }

    if (typeof payload.message === 'string' && payload.message.trim()) {
      return payload.message;
    }

    if (typeof payload.detail === 'string' && payload.detail.trim()) {
      return payload.detail;
    }

    if (Array.isArray(payload.errors) && payload.errors.length > 0) {
      const details = payload.errors
        .map((error) => error?.msg)
        .filter(Boolean)
        .join('; ');
      if (details) {
        return details;
      }
    }

    return fallback;
  }

  async function sendFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    setStatus('Enviando archivo al backend…');
    resetResults();

    try {
      const response = await fetch(`${OMR_API_BASE_URL}/api/omr`, {
        method: 'POST',
        body: formData,
      });

      setStatus('Procesando respuesta del backend…');

      let payload = null;
      try {
        payload = await response.json();
      } catch (parseError) {
        console.warn('No se pudo interpretar la respuesta del backend como JSON.', parseError);
      }

      if (!response.ok) {
        const message = extractErrorMessage(
          payload,
          `No se pudo procesar la partitura (código ${response.status}).`,
        );
        throw new Error(message);
      }

      if (!payload) {
        throw new Error('La respuesta del backend no tiene el formato esperado.');
      }

      if (payload.status && payload.status !== 'ok') {
        const message = extractErrorMessage(payload);
        throw new Error(message);
      }

      if (!payload.musicxml_url) {
        throw new Error('La respuesta del backend no incluye el enlace de descarga.');
      }

      renderDownloadResult(payload.musicxml_url, payload.original_filename, payload.result_id);
      setStatus('Conversión completada. Descarga disponible.', 'success');
    } catch (error) {
      console.error(error);
      setStatus(error.message || 'Error inesperado al contactar con el backend.', 'error');
      resetResults();
    }
  }

  function handleProcessClick() {
    const file = fileInput.files?.[0];

    if (!file) {
      setStatus('Selecciona un archivo antes de procesar.', 'error');
      resetResults();
      return;
    }

    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    if (!fileExtension || !ALLOWED_EXTENSIONS.includes(fileExtension)) {
      setStatus('Formato no soportado. Usa PNG, JPG, JPEG o PDF.', 'error');
      resetResults();
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setStatus('El archivo supera el tamaño máximo permitido (10 MB).', 'error');
      resetResults();
      return;
    }

    setStatus('Preparando archivo para enviar…');
    sendFile(file);
  }

  processButton?.addEventListener('click', handleProcessClick);
})();
