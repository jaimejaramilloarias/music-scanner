(function () {
  const fileInput = document.getElementById('scoreFile');
  const processButton = document.getElementById('processButton');
  const statusElement = document.getElementById('status');
  const resultsContainer = document.getElementById('results');
  const historyContainer = document.getElementById('history');
  const previewStatusElement = document.getElementById('previewStatus');
  const previewContentElement = document.getElementById('previewContent');
  const pdfOptions = document.getElementById('pdfOptions');
  const pageInput = document.getElementById('pageNumber');
  const pageDetails = document.getElementById('pageDetails');
  const processingModeSelect = document.getElementById('processingMode');
  const advancedParamsInput = document.getElementById('advancedParams');
  const backendUrlInput = document.getElementById('backendUrl');
  const backendApplyButton = document.getElementById('applyBackendUrl');
  const backendResetButton = document.getElementById('resetBackendUrl');
  const backendCheckButton = document.getElementById('checkBackendButton');
  const backendStatusElement = document.getElementById('backendStatus');
  const conversions = [];
  const DEMO_BACKEND_TOKENS = new Set(['demo', 'stub', 'browser', 'demo-mode']);
  const generatedObjectUrls = new Set();
  const historyDateFormatter = new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'short',
    timeStyle: 'medium',
  });
  const STORAGE_KEYS = {
    backendUrl: 'omrBackendUrl',
  };
  const queryParameters = new URLSearchParams(window.location.search);
  let currentPdfPageCount = null;
  let verovioToolkitInstance = null;
  let verovioToolkitError = false;
  let verovioToolkitPromise = null;
  let currentBackendUrl = null;
  let backendReachable = false;
  let backendHealthRequestId = 0;
  let backendMode = 'remote'; // 'remote' | 'demo'
  let demoFallbackActive = false;
  const demoFallbackEnabled = window.OMR_CONFIG?.enableDemoFallback !== false;

  window.addEventListener('beforeunload', () => {
    generatedObjectUrls.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch (error) {
        console.warn('No se pudo liberar un objeto generado para la demo.', error);
      }
    });
    generatedObjectUrls.clear();
  });

  const ALLOWED_PUBLIC_APP_URLS = [
    'https://jaimejaramilloarias.github.io/music-scanner',
    'https://jaimejaramilloarias.github.io/music-scanner/',
  ];
  const ALLOWED_LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

  function isLocalEnvironment() {
    const { protocol, hostname } = window.location;

    if (protocol === 'file:') {
      return true;
    }

    if (!hostname) {
      return true;
    }

    return ALLOWED_LOCAL_HOSTNAMES.has(hostname) || hostname.endsWith('.local');
  }

  function normalizePublicUrl(url) {
    if (typeof url !== 'string') {
      return null;
    }

    try {
      const parsed = new URL(url, window.location.origin);
      parsed.hash = '';
      parsed.search = '';
      const pathname = parsed.pathname.replace(/\/+$/, '');
      return `${parsed.origin}${pathname}`;
    } catch (error) {
      console.warn('No se pudo normalizar la URL proporcionada.', url, error);
      return null;
    }
  }

  function setStatus(message, type = 'info') {
    statusElement.textContent = message;
    statusElement.classList.remove('info', 'error', 'success');
    statusElement.classList.add(type);
  }

  function enforceAllowedFrontendLocation() {
    if (isLocalEnvironment()) {
      updateBackendStatus(
        'Modo local detectado. Configura la URL del backend si es necesario y asegúrate de que esté en ejecución.',
        'info',
      );
      setStatus('Aplicación en modo local. Puedes usar un backend en http://localhost:8000 por defecto.', 'info');
      return true;
    }

    const currentUrl = normalizePublicUrl(`${window.location.origin}${window.location.pathname}`);
    const isAllowed = ALLOWED_PUBLIC_APP_URLS.some((allowedUrl) => {
      const normalizedAllowed = normalizePublicUrl(allowedUrl);
      return normalizedAllowed && currentUrl && currentUrl.startsWith(normalizedAllowed);
    });

    if (isAllowed) {
      return true;
    }

    const warningMessage =
      'Estás utilizando la aplicación desde un dominio distinto al publicado oficialmente. Puedes continuar, pero asegúrate de configurar un backend accesible desde Internet.';
    setStatus(warningMessage, 'info');
    updateBackendStatus(warningMessage, 'info');
    return true;
  }

  if (window.pdfjsLib?.GlobalWorkerOptions) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.2.67/pdf.worker.min.js';
  }

  function safeGetFromStorage(key) {
    try {
      return window.localStorage?.getItem(key) ?? null;
    } catch (error) {
      console.warn('No se pudo leer del almacenamiento local.', error);
      return null;
    }
  }

  function safeSetInStorage(key, value) {
    try {
      window.localStorage?.setItem(key, value);
      return true;
    } catch (error) {
      console.warn('No se pudo guardar en el almacenamiento local.', error);
      return false;
    }
  }

  function safeRemoveFromStorage(key) {
    try {
      window.localStorage?.removeItem(key);
    } catch (error) {
      console.warn('No se pudo eliminar la clave del almacenamiento local.', error);
    }
  }

  function normalizeBackendUrl(rawUrl) {
    if (typeof rawUrl !== 'string') {
      return null;
    }

    const trimmed = rawUrl.trim();
    if (!trimmed) {
      return null;
    }

    if (trimmed === 'null') {
      return null;
    }

    const keyword = trimmed.toLowerCase();
    if (DEMO_BACKEND_TOKENS.has(keyword)) {
      return 'demo';
    }

    let candidate = trimmed;
    if (!/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(candidate)) {
      if (candidate.startsWith('//')) {
        candidate = `https:${candidate}`;
      } else if (!candidate.startsWith('/')) {
        candidate = `https://${candidate}`;
      }
    }

    try {
      const parsed = new URL(candidate, window.location.origin);
      parsed.hash = '';
      parsed.search = '';
      return parsed.toString().replace(/\/+$/, '');
    } catch (error) {
      console.warn('URL de backend no válida:', rawUrl, error);
      return null;
    }
  }

  function isDemoBackendConfigured() {
    return backendMode === 'demo';
  }

  function shouldUseDemoBackend() {
    return backendMode === 'demo' || demoFallbackActive;
  }

  function trackGeneratedObjectUrl(url) {
    if (typeof url !== 'string' || !url) {
      return;
    }

    generatedObjectUrls.add(url);
  }

  function activateDemoFallback(reason) {
    if (!demoFallbackEnabled || backendMode === 'demo') {
      return;
    }

    demoFallbackActive = true;
    updateProcessButtonState();

    if (reason) {
      updateBackendStatus(reason, 'info');
      setStatus(reason, 'info');
    }
  }

  function clearDemoFallback() {
    if (!demoFallbackActive) {
      return;
    }

    demoFallbackActive = false;
    updateProcessButtonState();
  }

  function escapeXml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function delay(ms) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  function getBackendUrlFromConfig() {
    const config = window.OMR_CONFIG ?? {};
    if (typeof config.apiBaseUrl === 'string') {
      return config.apiBaseUrl;
    }
    if (typeof config.defaultBackendUrl === 'string') {
      return config.defaultBackendUrl;
    }
    if (typeof window.OMR_API_BASE_URL === 'string') {
      return window.OMR_API_BASE_URL;
    }
    return null;
  }

  function getSameOriginBackendUrl() {
    const { origin, protocol } = window.location;
    if (protocol === 'file:' || !origin || origin === 'null') {
      return null;
    }

    return normalizeBackendUrl(origin);
  }

  function getBackendUrlFromStorage() {
    return safeGetFromStorage(STORAGE_KEYS.backendUrl);
  }

  function getBackendUrlFromQuery() {
    const parameterNames = ['backend', 'apiBaseUrl', 'api_base_url'];
    for (const name of parameterNames) {
      const value = queryParameters.get(name);
      if (value) {
        return value;
      }
    }
    return null;
  }

  function updateBackendStatus(message, type = 'info') {
    if (!backendStatusElement) {
      return;
    }

    backendStatusElement.textContent = message;
    backendStatusElement.classList.remove('info', 'error', 'success');
    backendStatusElement.classList.add(type);
  }

  function updateProcessButtonState() {
    if (!processButton) {
      return;
    }

    const demoActive = shouldUseDemoBackend();
    processButton.disabled = !currentBackendUrl && !demoActive;
    if (!currentBackendUrl && !demoActive) {
      processButton.title = 'Configura la URL del backend antes de procesar partituras.';
    } else if (demoActive) {
      processButton.title = 'Procesarás la partitura en el modo demostración del navegador.';
    } else {
      processButton.title = '';
    }
  }

  function setBackendUrl(rawUrl, { persist = false, announce = true } = {}) {
    const normalized = normalizeBackendUrl(rawUrl);
    if (!normalized) {
      if (announce) {
        updateBackendStatus('La URL del backend no es válida. Revisa el formato e inténtalo de nuevo.', 'error');
      }
      return false;
    }

    if (normalized === 'demo') {
      backendMode = 'demo';
      currentBackendUrl = null;
      clearDemoFallback();
      if (persist) {
        safeSetInStorage(STORAGE_KEYS.backendUrl, 'demo');
      }

      if (backendUrlInput) {
        backendUrlInput.value = 'demo';
      }

      updateProcessButtonState();

      if (announce) {
        updateBackendStatus(
          'Modo demostración activado. El procesamiento se realizará íntegramente en el navegador.',
          'info',
        );
        setStatus('Modo demostración activado. Puedes volver a un backend real cuando quieras.', 'info');
      }

      return true;
    }

    backendMode = 'remote';
    currentBackendUrl = normalized;
    if (persist) {
      safeSetInStorage(STORAGE_KEYS.backendUrl, normalized);
    }

    if (backendUrlInput) {
      backendUrlInput.value = normalized;
    }

    clearDemoFallback();
    updateProcessButtonState();

    if (announce) {
      updateBackendStatus(`Backend configurado en ${normalized}.`, 'success');
    }

    return true;
  }

  async function checkBackendHealth() {
    if (isDemoBackendConfigured()) {
      backendReachable = true;
      updateBackendStatus(
        'Modo demostración activo. El procesamiento se realizará directamente en tu navegador.',
        'info',
      );
      setStatus('Modo demostración activo. Puedes configurar un backend público cuando lo necesites.', 'info');
      return true;
    }

    if (!currentBackendUrl) {
      backendReachable = demoFallbackActive;
      if (demoFallbackActive) {
        updateBackendStatus(
          'Modo demostración activo. Configura una URL de backend remoto para volver a intentarlo.',
          'info',
        );
      } else {
        updateBackendStatus('Configura la URL del backend antes de comprobar la conexión.', 'error');
      }
      return backendReachable;
    }

    const requestId = ++backendHealthRequestId;
    updateBackendStatus('Comprobando la disponibilidad del backend…', 'info');

    try {
      const response = await fetch(`${currentBackendUrl}/api/health`, {
        method: 'GET',
        cache: 'no-store',
      });

      let payload = null;
      try {
        payload = await response.json();
      } catch (error) {
        // Ignoramos errores al interpretar JSON para mostrar un mensaje genérico.
      }

      if (requestId !== backendHealthRequestId) {
        return backendReachable;
      }

      if (response.ok && payload && payload.status === 'ok') {
        backendReachable = true;
        clearDemoFallback();
        updateBackendStatus(`Backend operativo (${currentBackendUrl}).`, 'success');
        return true;
      }

      const detailMessage =
        (payload && (payload.message || payload.detail)) ||
        `Respuesta inesperada del backend (código ${response.status}).`;
      throw new Error(detailMessage);
    } catch (error) {
      if (requestId !== backendHealthRequestId) {
        return backendReachable;
      }

      backendReachable = false;
      const baseMessage = `No se pudo contactar con el backend: ${error.message || 'Error desconocido.'}`;
      updateBackendStatus(baseMessage, 'error');
      if (demoFallbackEnabled) {
        const demoMessage = `${baseMessage} Se activó el modo demostración en el navegador para que puedas continuar probando la interfaz.`;
        activateDemoFallback(demoMessage);
      }
      return shouldUseDemoBackend();
    }
  }

  function initializeBackendConfiguration() {
    const queryBackend = normalizeBackendUrl(getBackendUrlFromQuery());
    const storedBackend = normalizeBackendUrl(getBackendUrlFromStorage());
    const configuredBackend = normalizeBackendUrl(getBackendUrlFromConfig());
    const fallbackBackend = getSameOriginBackendUrl();

    if (queryBackend && setBackendUrl(queryBackend, { persist: true, announce: false })) {
      updateBackendStatus(
        'URL del backend tomada de los parámetros del enlace. Verificando disponibilidad…',
        'info',
      );
    } else if (storedBackend && setBackendUrl(storedBackend, { announce: false })) {
      updateBackendStatus('Usando la última URL del backend guardada en este navegador.', 'info');
    } else if (configuredBackend && setBackendUrl(configuredBackend, { announce: false })) {
      updateBackendStatus('Usando la URL del backend definida en config.js.', 'info');
    } else if (fallbackBackend && setBackendUrl(fallbackBackend, { announce: false })) {
      updateBackendStatus('Usando el mismo origen de la página como backend.', 'info');
    } else {
      setBackendUrl('demo', { announce: false });
      updateBackendStatus(
        'No se encontró un backend configurado. Se activó el modo demostración en el navegador.',
        'info',
      );
      setStatus('Modo demostración activo. Configura un backend público cuando quieras procesar de forma real.', 'info');
    }

    if (currentBackendUrl || isDemoBackendConfigured()) {
      void checkBackendHealth();
    }
  }

  function handleApplyBackendUrl() {
    if (!backendUrlInput) {
      return;
    }

    const rawUrl = backendUrlInput.value;
    if (!rawUrl || !rawUrl.trim()) {
      updateBackendStatus('Introduce una URL antes de aplicar los cambios.', 'error');
      return;
    }

    if (setBackendUrl(rawUrl, { persist: true })) {
      void checkBackendHealth();
    }
  }

  function handleResetBackendUrl() {
    safeRemoveFromStorage(STORAGE_KEYS.backendUrl);

    const configuredBackend = normalizeBackendUrl(getBackendUrlFromConfig());
    const fallbackBackend = getSameOriginBackendUrl();

    if (configuredBackend && setBackendUrl(configuredBackend, { announce: false })) {
      updateBackendStatus('Se restableció la URL definida en config.js.', 'info');
      void checkBackendHealth();
      return;
    }

    if (fallbackBackend && setBackendUrl(fallbackBackend, { announce: false })) {
      updateBackendStatus('Se restableció la URL del mismo origen.', 'info');
      void checkBackendHealth();
      return;
    }

    setBackendUrl('demo', { announce: false, persist: true });
    updateBackendStatus(
      'Se restableció el modo demostración para seguir utilizando la aplicación sin backend.',
      'info',
    );
    setStatus('Modo demostración activo tras restablecer la configuración.', 'info');
  }

  const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
  const ALLOWED_EXTENSIONS = ['png', 'jpg', 'jpeg', 'pdf'];
  const FALLBACK_PROCESSING_MODES = [
    { value: 'auto', label: 'Automático' },
    { value: 'printed', label: 'Impreso' },
    { value: 'handwritten', label: 'Manuscrito' },
  ];

  function sanitizeProcessingModes(rawModes) {
    if (!Array.isArray(rawModes)) {
      return [];
    }

    return rawModes
      .map((mode) => {
        if (!mode || typeof mode !== 'object') {
          return null;
        }

        const value = String(mode.value ?? '').trim();
        if (!value) {
          return null;
        }

        const label = String(mode.label ?? '').trim() || value;
        return { value: value.toLowerCase(), label };
      })
      .filter(Boolean);
  }

  const configuredProcessingModes = sanitizeProcessingModes(window.OMR_PROCESSING_MODES);
  const processingModes = configuredProcessingModes.length
    ? configuredProcessingModes
    : FALLBACK_PROCESSING_MODES;
  const processingModeMap = new Map(
    processingModes.map((mode) => [mode.value.toLowerCase(), mode.label]),
  );
  const defaultProcessingMode =
    (processingModeMap.has('auto') && 'auto') || processingModes[0]?.value || 'auto';

  function describeProcessingMode(mode) {
    if (!mode) {
      return '';
    }

    const normalized = String(mode).toLowerCase();
    return processingModeMap.get(normalized) || mode;
  }

  function populateProcessingModeOptions() {
    if (!processingModeSelect) {
      return;
    }

    processingModeSelect.innerHTML = '';
    processingModes.forEach((mode) => {
      const option = document.createElement('option');
      option.value = mode.value;
      option.textContent = mode.label;
      processingModeSelect.appendChild(option);
    });

    if (processingModeMap.has(defaultProcessingMode)) {
      processingModeSelect.value = defaultProcessingMode;
    } else if (processingModes.length > 0) {
      processingModeSelect.value = processingModes[0].value;
    }
  }

  function sanitizeCliArguments(argumentsArray) {
    if (Array.isArray(argumentsArray)) {
      return argumentsArray
        .map((arg) => String(arg ?? '').trim())
        .filter((arg) => arg.length > 0);
    }

    if (typeof argumentsArray === 'string') {
      return argumentsArray
        .split(/\s+/)
        .map((arg) => arg.trim())
        .filter((arg) => arg.length > 0);
    }

    return [];
  }

  function formatCliArguments(argumentsArray) {
    const sanitized = sanitizeCliArguments(argumentsArray);
    return sanitized.join(' ');
  }

  function resetResults() {
    resultsContainer.innerHTML = '<p class="placeholder">Aquí aparecerá el enlace para descargar el MusicXML.</p>';
  }

  function setPreviewStatus(message, type = 'info') {
    if (!previewStatusElement) {
      return;
    }

    previewStatusElement.textContent = message;
    previewStatusElement.classList.remove('info', 'error', 'success');
    previewStatusElement.classList.add(type);
  }

  function showPreviewPlaceholder(text) {
    if (!previewContentElement) {
      return;
    }

    previewContentElement.innerHTML = `<p class="placeholder">${text}</p>`;
  }

  function resetPreview() {
    if (!previewContentElement || !previewStatusElement) {
      return;
    }

    setPreviewStatus(
      'La previsualización aparecerá aquí cuando haya un resultado disponible.',
      'info',
    );
    showPreviewPlaceholder('Todavía no hay ninguna previsualización disponible.');
  }

  function preparePreviewForProcessing() {
    if (!previewContentElement || !previewStatusElement) {
      return;
    }

    setPreviewStatus('La previsualización se actualizará cuando finalice la conversión.', 'info');
    showPreviewPlaceholder('Generando previsualización…');
  }

  async function ensureVerovioToolkit() {
    if (verovioToolkitInstance) {
      return verovioToolkitInstance;
    }

    if (verovioToolkitError) {
      return null;
    }

    if (verovioToolkitPromise) {
      return verovioToolkitPromise;
    }

    if (!window.verovio || typeof window.verovio.toolkit !== 'function') {
      console.warn('La librería Verovio no está disponible en la página.');
      verovioToolkitError = true;
      return null;
    }

    verovioToolkitPromise = Promise.resolve()
      .then(() => new window.verovio.toolkit())
      .then((toolkit) => {
        verovioToolkitInstance = toolkit;
        return toolkit;
      })
      .catch((error) => {
        console.error('No se pudo inicializar el visor Verovio.', error);
        verovioToolkitError = true;
        return null;
      })
      .finally(() => {
        verovioToolkitPromise = null;
      });

    return verovioToolkitPromise;
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

  function renderLatestResult(
    url,
    originalFilename,
    resultId,
    pageNumber,
    totalPages,
    processingMode,
    appliedArguments,
  ) {
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
    const identifier = document.createElement('p');
    identifier.className = 'download-id';
    identifier.textContent = resultId ? `ID de referencia: ${resultId}` : '';

    wrapper.appendChild(info);
    wrapper.appendChild(link);

    if (pageInfo) {
      const pageParagraph = document.createElement('p');
      pageParagraph.className = 'download-page-info';
      pageParagraph.textContent = pageInfo;
      wrapper.appendChild(pageParagraph);
    }

    const modeLabel = describeProcessingMode(processingMode);
    if (modeLabel) {
      const modeParagraph = document.createElement('p');
      modeParagraph.className = 'download-processing-mode';
      modeParagraph.textContent = `Modo de reconocimiento: ${modeLabel}.`;
      wrapper.appendChild(modeParagraph);
    }

    const cliArgumentsText = formatCliArguments(appliedArguments);
    if (cliArgumentsText) {
      const extraParagraph = document.createElement('p');
      extraParagraph.className = 'download-extra-options';
      extraParagraph.textContent = `Parámetros adicionales: ${cliArgumentsText}`;
      wrapper.appendChild(extraParagraph);
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
      const modeLabel = describeProcessingMode(conversion.processingMode);
      if (modeLabel) {
        metadataParts.push(`Modo: ${modeLabel}`);
      }
      metadataParts.push(timestamp);
      metadata.textContent = metadataParts.join(' · ');

      actions.appendChild(link);

      item.appendChild(title);
      item.appendChild(metadata);
      const cliArgumentsText = formatCliArguments(conversion.appliedArguments);
      if (cliArgumentsText) {
        const advanced = document.createElement('p');
        advanced.className = 'history-advanced';
        advanced.textContent = `Parámetros adicionales: ${cliArgumentsText}`;
        item.appendChild(advanced);
      }
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
      processingMode: payload.processing_mode || defaultProcessingMode,
      appliedArguments: sanitizeCliArguments(payload.applied_cli_arguments),
      completedAt: new Date(),
    };

    conversions.push(conversion);
    renderLatestResult(
      conversion.url,
      conversion.originalFilename,
      conversion.resultId,
      conversion.pageNumber,
      conversion.totalPages,
      conversion.processingMode,
      conversion.appliedArguments,
    );
    renderHistory();
    void renderPreview(conversion);
  }

  async function renderPreview(conversion) {
    if (!conversion || !previewContentElement || !previewStatusElement) {
      return;
    }

    setPreviewStatus('Generando previsualización del MusicXML…', 'info');
    showPreviewPlaceholder('Cargando MusicXML para mostrar la partitura.');

    const toolkit = await ensureVerovioToolkit();
    if (!toolkit) {
      setPreviewStatus(
        'El visor integrado no está disponible en este navegador. Descarga el MusicXML para revisarlo manualmente.',
        'error',
      );
      showPreviewPlaceholder('Descarga el MusicXML para revisarlo en tu editor preferido.');
      return;
    }

    try {
      const response = await fetch(conversion.url, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`No se pudo cargar el MusicXML (código ${response.status}).`);
      }

      const musicXml = await response.text();

      toolkit.setOptions({
        adjustPageHeight: true,
        svgViewBox: true,
        footer: 'none',
        header: 'none',
        scale: 35,
        pageWidth: 2100,
        pageHeight: 2970,
        ignoreLayout: 1,
      });

      toolkit.loadData(musicXml, {});
      const totalPages = toolkit.getPageCount();
      const svg = toolkit.renderToSVG(1, {});

      previewContentElement.innerHTML = svg;

      const messageParts = ['Previsualización generada correctamente.'];
      if (Number.isInteger(totalPages) && totalPages > 1) {
        messageParts.push(`Mostrando la página 1 de ${totalPages}.`);
      }
      if (conversion.originalFilename) {
        messageParts.push(`Archivo: “${conversion.originalFilename}”.`);
      }
      const modeLabel = describeProcessingMode(conversion.processingMode);
      if (modeLabel) {
        messageParts.push(`Modo: ${modeLabel}.`);
      }

      setPreviewStatus(messageParts.join(' '), 'success');
    } catch (error) {
      console.error('No se pudo renderizar la previsualización.', error);
      setPreviewStatus(
        'No se pudo generar la previsualización. Descarga el MusicXML para revisarlo manualmente.',
        'error',
      );
      showPreviewPlaceholder('Descarga el MusicXML para revisarlo en tu editor preferido.');
    }
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

  function generateDemoMusicXml({
    filename,
    pageNumber,
    totalPages,
    processingMode,
    advancedArgs,
    fileSize,
    createdAt,
  }) {
    const safeFilename = escapeXml(filename || 'Archivo sin nombre');
    const safeTitle = escapeXml(filename ? `Demo OMR – ${filename}` : 'Demo OMR');
    const pageInfo = describePage(pageNumber, totalPages) || 'Sin información de página';
    const safePageInfo = escapeXml(pageInfo);
    const safeMode = escapeXml((processingMode || defaultProcessingMode || 'auto').toLowerCase());
    const advancedText = Array.isArray(advancedArgs) && advancedArgs.length
      ? advancedArgs.join(' ')
      : 'Sin parámetros adicionales';
    const safeAdvancedText = escapeXml(advancedText);
    const safeCreatedAt = escapeXml(createdAt || new Date().toISOString());
    const safeFileSize = escapeXml(Number.isFinite(fileSize) ? String(fileSize) : 'desconocido');

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work>
    <work-title>${safeTitle}</work-title>
  </work>
  <identification>
    <creator type="composer">Music Scanner (modo demostración)</creator>
    <encoding>
      <software>Music Scanner – Demo sin backend</software>
      <encoding-date>${safeCreatedAt}</encoding-date>
    </encoding>
    <miscellaneous>
      <miscellaneous-field name="original-filename">${safeFilename}</miscellaneous-field>
      <miscellaneous-field name="page-information">${safePageInfo}</miscellaneous-field>
      <miscellaneous-field name="processing-mode">${safeMode}</miscellaneous-field>
      <miscellaneous-field name="advanced-arguments">${safeAdvancedText}</miscellaneous-field>
      <miscellaneous-field name="file-size-bytes">${safeFileSize}</miscellaneous-field>
    </miscellaneous>
  </identification>
  <part-list>
    <score-part id="P1">
      <part-name>Demo</part-name>
    </score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key>
          <fifths>0</fifths>
        </key>
        <time>
          <beats>4</beats>
          <beat-type>4</beat-type>
        </time>
        <clef>
          <sign>G</sign>
          <line>2</line>
        </clef>
      </attributes>
      <note>
        <pitch>
          <step>C</step>
          <octave>4</octave>
        </pitch>
        <duration>4</duration>
        <type>whole</type>
      </note>
      <direction placement="below">
        <direction-type>
          <words>Resultado de demostración generado directamente en tu navegador.</words>
        </direction-type>
      </direction>
    </measure>
  </part>
</score-partwise>`;
  }

  async function processWithDemoBackend(file, pageNumber, selectedMode, advancedArguments) {
    const modeToUse = (selectedMode || defaultProcessingMode || 'auto').toLowerCase();
    const sanitizedArguments = sanitizeCliArguments(advancedArguments);
    backendReachable = true;

    updateBackendStatus(
      'Modo demostración: generando un MusicXML ficticio en tu navegador.',
      'info',
    );
    setStatus('Procesando la partitura en el modo demostración…', 'info');

    await delay(800);

    const now = new Date();
    const musicXml = generateDemoMusicXml({
      filename: file?.name || 'Archivo sin nombre',
      pageNumber,
      totalPages: currentPdfPageCount,
      processingMode: modeToUse,
      advancedArgs: sanitizedArguments,
      fileSize: file?.size ?? null,
      createdAt: now.toISOString(),
    });

    const blob = new Blob([musicXml], {
      type: 'application/vnd.recordare.musicxml+xml',
    });
    const objectUrl = URL.createObjectURL(blob);
    trackGeneratedObjectUrl(objectUrl);

    const payload = {
      status: 'ok',
      musicxml_url: objectUrl,
      original_filename: file?.name || '',
      result_id: `demo-${now.getTime()}`,
      page_number: pageNumber ?? null,
      total_pages: currentPdfPageCount,
      processing_mode: modeToUse,
      applied_cli_arguments: sanitizedArguments,
    };

    registerConversion(payload);
    setStatus('Conversión de demostración completada. Descarga disponible.', 'success');
    updateBackendStatus('Modo demostración activo. El resultado se generó en tu navegador.', 'success');
  }

  async function sendFile(file, pageNumber) {
    const selectedMode = (processingModeSelect?.value || defaultProcessingMode).trim();
    const advancedOptionsRaw = advancedParamsInput?.value ?? '';
    const sanitizedAdvancedArguments = sanitizeCliArguments(advancedOptionsRaw);

    resetResults();
    preparePreviewForProcessing();

    if (shouldUseDemoBackend()) {
      await processWithDemoBackend(file, pageNumber, selectedMode, sanitizedAdvancedArguments);
      return;
    }

    if (!currentBackendUrl) {
      setStatus('Configura la URL del backend antes de procesar partituras.', 'error');
      updateBackendStatus('Configura la URL del backend antes de procesar partituras.', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    if (selectedMode) {
      formData.append('processing_mode', selectedMode);
    }
    const advancedOptions = advancedOptionsRaw.trim();
    if (advancedOptions) {
      formData.append('advanced_options', advancedOptions);
    }
    if (typeof pageNumber === 'number' && Number.isFinite(pageNumber)) {
      formData.append('page', String(pageNumber));
    }

    setStatus('Enviando archivo al backend…');
    updateBackendStatus('Enviando archivo al backend…', 'info');

    try {
      const response = await fetch(`${currentBackendUrl}/api/omr`, {
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
      updateBackendStatus('El backend respondió correctamente a la solicitud.', 'success');
    } catch (error) {
      console.error(error);
      setStatus(error.message || 'Error inesperado al contactar con el backend.', 'error');
      updateBackendStatus(error.message || 'Error inesperado al contactar con el backend.', 'error');
      resetResults();
      setPreviewStatus('No se pudo generar la previsualización para esta conversión.', 'error');
      showPreviewPlaceholder('Descarga el MusicXML para revisarlo manualmente.');
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

  if (!enforceAllowedFrontendLocation()) {
    return;
  }

  populateProcessingModeOptions();
  initializeBackendConfiguration();

  backendApplyButton?.addEventListener('click', handleApplyBackendUrl);
  backendResetButton?.addEventListener('click', handleResetBackendUrl);
  backendCheckButton?.addEventListener('click', () => {
    void checkBackendHealth();
  });
  backendUrlInput?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleApplyBackendUrl();
    }
  });

  fileInput?.addEventListener('change', () => {
    void handleFileChange();
  });

  pageInput?.addEventListener('input', handlePageInputChange);
  processButton?.addEventListener('click', handleProcessClick);

  resetPreview();
})();
