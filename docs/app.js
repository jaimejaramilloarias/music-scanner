(function () {
  const fileInput = document.getElementById('scoreFile');
  const processButton = document.getElementById('processButton');
  const statusElement = document.getElementById('status');
  const resultsContainer = document.getElementById('results');
  const historyContainer = document.getElementById('history');
  const pdfOptions = document.getElementById('pdfOptions');
  const pageInput = document.getElementById('pageNumber');
  const pageDetails = document.getElementById('pageDetails');
  const conversions = [];
  const historyDateFormatter = new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'short',
    timeStyle: 'medium',
  });
  let currentPdfPageCount = null;

  if (window.pdfjsLib?.GlobalWorkerOptions) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.worker.min.js';
  }

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

  function describePage(pageNumber, totalPages) {
    if (!pageNumber) {
      return '';
    }

    if (totalPages) {
      return `Página ${pageNumber} de ${totalPages}`;
    }

    return `Página ${pageNumber}`;
  }

  function renderLatestResult(url, originalFilename, resultId, pageNumber, totalPages) {
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

    const pageInfo = describePage(pageNumber, totalPages);
    let pageParagraph = null;
    if (pageInfo) {
      pageParagraph = document.createElement('p');
      pageParagraph.className = 'download-page-info';
      pageParagraph.textContent = pageInfo;
    }

    const identifier = document.createElement('p');
    identifier.className = 'download-id';
    identifier.textContent = resultId ? `ID de referencia: ${resultId}` : '';

    wrapper.appendChild(info);
    wrapper.appendChild(link);
    if (pageParagraph) {
      wrapper.appendChild(pageParagraph);
    }
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
      const metadataParts = [];
      if (conversion.resultId) {
        metadataParts.push(`ID: ${conversion.resultId}`);
      }
      const pageInfo = describePage(conversion.pageNumber, conversion.totalPages);
      if (pageInfo) {
        metadataParts.push(pageInfo);
      }
      metadataParts.push(timestamp);
      metadata.textContent = metadataParts.join(' · ');

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
      pageNumber: payload.page_number ?? null,
      totalPages: payload.total_pages ?? null,
      completedAt: new Date(),
    };

    conversions.push(conversion);
    renderLatestResult(
      conversion.url,
      conversion.originalFilename,
      conversion.resultId,
      conversion.pageNumber,
      conversion.totalPages,
    );
    renderHistory();
  }

  function showPdfOptions() {
    if (!pdfOptions) {
      return;
    }

    pdfOptions.classList.remove('hidden');
    if (pageInput) {
      const parsed = Number.parseInt(pageInput.value, 10);
      if (!Number.isInteger(parsed) || parsed < 1) {
        pageInput.value = '1';
      }
    }

    updatePdfDetails();
  }

  function hidePdfOptions() {
    currentPdfPageCount = null;

    if (pdfOptions) {
      pdfOptions.classList.add('hidden');
    }

    if (pageInput) {
      pageInput.value = '1';
      pageInput.removeAttribute('max');
    }

    if (pageDetails) {
      pageDetails.textContent = 'Procesará la página 1.';
    }
  }

  function updatePdfDetails() {
    if (!pageInput || !pageDetails) {
      return;
    }

    const parsed = Number.parseInt(pageInput.value, 10) || 1;
    const description = describePage(parsed, currentPdfPageCount);
    pageDetails.textContent = description || `Procesará la página ${parsed}.`;
  }

  function handlePageInputChange() {
    if (!pageInput) {
      return;
    }

    let parsed = Number.parseInt(pageInput.value, 10);
    if (!Number.isInteger(parsed) || parsed < 1) {
      parsed = 1;
    } else if (currentPdfPageCount && parsed > currentPdfPageCount) {
      parsed = currentPdfPageCount;
    }

    pageInput.value = String(parsed);
    updatePdfDetails();
  }

  async function updatePdfPageCount(file) {
    if (!pageInput) {
      currentPdfPageCount = null;
      return;
    }

    if (!window.pdfjsLib || typeof window.pdfjsLib.getDocument !== 'function') {
      currentPdfPageCount = null;
      pageInput.removeAttribute('max');
      updatePdfDetails();
      return;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      const numPages = Number.parseInt(pdf?.numPages, 10);
      currentPdfPageCount = Number.isInteger(numPages) && numPages > 0 ? numPages : null;
    } catch (error) {
      console.warn('No se pudo determinar la cantidad de páginas del PDF.', error);
      currentPdfPageCount = null;
    }

    if (pageInput) {
      if (currentPdfPageCount) {
        pageInput.max = String(currentPdfPageCount);
        const currentValue = Number.parseInt(pageInput.value, 10);
        if (Number.isInteger(currentValue) && currentValue > currentPdfPageCount) {
          pageInput.value = String(currentPdfPageCount);
        }
      } else {
        pageInput.removeAttribute('max');
      }
    }

    updatePdfDetails();
  }

  async function handleFileChange() {
    const file = fileInput?.files?.[0];

    if (!file) {
      hidePdfOptions();
      return;
    }

    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension === 'pdf') {
      showPdfOptions();
      await updatePdfPageCount(file);
    } else {
      hidePdfOptions();
    }
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

  async function sendFile(file, pageNumber) {
    const formData = new FormData();
    formData.append('file', file);
    if (typeof pageNumber === 'number' && Number.isFinite(pageNumber)) {
      formData.append('page', String(pageNumber));
    }

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

    let pageNumberToSend = null;
    if (fileExtension === 'pdf') {
      const parsed = Number.parseInt(pageInput?.value ?? '1', 10);
      if (!Number.isInteger(parsed) || parsed < 1) {
        setStatus('Selecciona una página válida (número entero mayor o igual a 1).', 'error');
        resetResults();
        return;
      }

      if (currentPdfPageCount && parsed > currentPdfPageCount) {
        setStatus(
          `La página seleccionada supera las ${currentPdfPageCount} páginas disponibles en el PDF.`,
          'error',
        );
        resetResults();
        return;
      }

      pageNumberToSend = parsed;
    }

    setStatus('Preparando archivo para enviar…');
    void sendFile(file, pageNumberToSend);
  }

  fileInput?.addEventListener('change', () => {
    void handleFileChange();
  });

  pageInput?.addEventListener('input', handlePageInputChange);
  processButton?.addEventListener('click', handleProcessClick);
})();
