(function () {
  const fileInput = document.getElementById('scoreFile');
  const processButton = document.getElementById('processButton');
  const statusElement = document.getElementById('status');
  const resultsContainer = document.getElementById('results');
  const historyContainer = document.getElementById('history');
  const conversions = [];
  const historyDateFormatter = new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'short',
    timeStyle: 'medium',
  });

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

  function renderLatestResult(url, originalFilename, resultId) {
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

  function renderHistory() {
    if (!historyContainer) {
      return;
    }

    historyContainer.innerHTML = '';

    if (conversions.length === 0) {
      historyContainer.innerHTML =
        '<p class="placeholder">Todavía no has procesado ninguna partitura.</p>';
      return;
    }

    const list = document.createElement('ol');
    list.className = 'history-list';

    const reversed = [...conversions].reverse();

    reversed.forEach((conversion) => {
      const item = document.createElement('li');
      item.className = 'history-item';

      const title = document.createElement('p');
      title.className = 'history-title';
      title.textContent = conversion.originalFilename
        ? `“${conversion.originalFilename}”`
        : 'Conversión sin nombre';

      const actions = document.createElement('div');
      actions.className = 'history-actions';

      const link = document.createElement('a');
      link.className = 'history-link';
      link.href = conversion.url;
      link.textContent = 'Descargar';
      link.target = '_blank';
      link.rel = 'noopener';

      const metadata = document.createElement('p');
      metadata.className = 'history-meta';
      const timestamp = historyDateFormatter.format(conversion.completedAt);
      metadata.textContent = conversion.resultId
        ? `ID: ${conversion.resultId} · ${timestamp}`
        : timestamp;

      actions.appendChild(link);

      item.appendChild(title);
      item.appendChild(metadata);
      item.appendChild(actions);

      list.appendChild(item);
    });

    historyContainer.appendChild(list);
  }

  function registerConversion(payload) {
    const conversion = {
      url: payload.musicxml_url,
      originalFilename: payload.original_filename || '',
      resultId: payload.result_id || '',
      completedAt: new Date(),
    };

    conversions.push(conversion);
    renderLatestResult(conversion.url, conversion.originalFilename, conversion.resultId);
    renderHistory();
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

      registerConversion(payload);
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
