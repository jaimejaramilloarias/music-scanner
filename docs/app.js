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

  function handleProcessClick() {
    const file = fileInput.files?.[0];

    if (!file) {
      setStatus('Selecciona un archivo antes de procesar.', 'error');
      resetResults();
      return;
    }

    // Validación mínima basada en la extensión del archivo.
    const allowedExtensions = ['png', 'jpg', 'jpeg', 'pdf'];
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    if (!fileExtension || !allowedExtensions.includes(fileExtension)) {
      setStatus('Formato no soportado. Usa PNG, JPG, JPEG o PDF.', 'error');
      resetResults();
      return;
    }

    setStatus('Preparado para enviar el archivo al backend. Implementa la lógica de fetch en fases posteriores.');
  }

  processButton?.addEventListener('click', handleProcessClick);
})();
