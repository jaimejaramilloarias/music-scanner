(function () {
  const fileInput = document.getElementById('scoreFile');
  const processButton = document.getElementById('processButton');
  const statusElement = document.getElementById('status');
  const resultsContainer = document.getElementById('results');

  function setStatus(message, type = 'info') {
    statusElement.textContent = message;
    statusElement.classList.remove('error', 'success');
    if (type === 'error') {
      statusElement.classList.add('error');
    }
    if (type === 'success') {
      statusElement.classList.add('success');
    }
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

      const payload = await response.json();
      if (!response.ok) {
        const message = payload?.detail || 'No se pudo procesar la partitura.';
        throw new Error(message);
      }

      if (payload.status && payload.status !== 'ok') {
        const message = payload?.message || payload?.detail || 'No se pudo procesar la partitura.';
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

    const allowedExtensions = ['png', 'jpg', 'jpeg', 'pdf'];
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    if (!fileExtension || !allowedExtensions.includes(fileExtension)) {
      setStatus('Formato no soportado. Usa PNG, JPG, JPEG o PDF.', 'error');
      resetResults();
      return;
    }

    setStatus('Preparando archivo para enviar…');
    sendFile(file);
  }

  processButton?.addEventListener('click', handleProcessClick);
})();
