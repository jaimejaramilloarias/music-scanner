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

  function renderJsonResult(payload) {
    const list = document.createElement('dl');
    list.className = 'json-result';

    Object.entries(payload).forEach(([key, value]) => {
      const term = document.createElement('dt');
      term.textContent = key;
      const definition = document.createElement('dd');
      definition.textContent = String(value);
      list.appendChild(term);
      list.appendChild(definition);
    });

    resultsContainer.innerHTML = '';
    resultsContainer.appendChild(list);
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

      const payload = await response.json();
      if (!response.ok) {
        const message = payload?.detail || 'No se pudo procesar la partitura.';
        throw new Error(message);
      }

      renderJsonResult(payload);
      setStatus('Archivo recibido correctamente por el backend.', 'success');
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

    sendFile(file);
  }

  processButton?.addEventListener('click', handleProcessClick);
})();
