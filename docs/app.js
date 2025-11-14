(function () {
  'use strict';

  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('scoreFile');
  const selectedFileInfo = document.getElementById('selectedFileInfo');
  const processButton = document.getElementById('processButton');
  const statusElement = document.getElementById('status');
  const resultsContainer = document.getElementById('results');
  const analysisDetails = document.getElementById('analysisDetails');
  const previewStatusElement = document.getElementById('previewStatus');
  const previewContentElement = document.getElementById('previewContent');
  const historyContainer = document.getElementById('history');

  const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024;
  const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg']);
  const ALLOWED_EXTENSIONS = new Set(['png', 'jpg', 'jpeg']);

  const conversions = [];
  const generatedObjectUrls = new Set();
  const historyDateFormatter = new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  let selectedFile = null;

  const cvReadyPromise = new Promise((resolve, reject) => {
    if (window.cv?.Mat) {
      resolve();
      return;
    }

    const timeoutId = window.setTimeout(() => {
      reject(new Error('OpenCV.js tardó demasiado en inicializarse. Recarga la página.'));
    }, 20000);

    window.addEventListener(
      'opencv-ready',
      () => {
        window.clearTimeout(timeoutId);
        resolve();
      },
      { once: true },
    );

    window.addEventListener(
      'opencv-error',
      (event) => {
        window.clearTimeout(timeoutId);
        reject(event?.detail ?? new Error('No se pudo cargar OpenCV.js. Verifica tu conexión.'));
      },
      { once: true },
    );
  });

  const verovioToolkitPromise = new Promise((resolve) => {
    const initialise = () => {
      try {
        resolve(new window.verovio.toolkit());
      } catch (error) {
        console.warn('No se pudo inicializar Verovio.', error);
        resolve(null);
      }
    };

    if (window.verovio?.toolkit) {
      initialise();
    } else {
      window.addEventListener('verovio-ready', initialise, { once: true });
      window.addEventListener(
        'verovio-error',
        (event) => {
          console.warn('No se pudo cargar la librería de Verovio.', event?.detail);
          resolve(null);
        },
        { once: true },
      );
    }
  });

  window.addEventListener('beforeunload', () => {
    generatedObjectUrls.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch (error) {
        console.warn('No se pudo liberar un recurso temporal.', error);
      }
    });
    generatedObjectUrls.clear();
  });

  processButton.disabled = true;

  cvReadyPromise
    .then(() => {
      setStatus('Listo para analizar partituras en el navegador. Selecciona un archivo para comenzar.', 'success');
      processButton.disabled = false;
    })
    .catch((error) => {
      console.error(error);
      setStatus(error.message, 'error');
      processButton.disabled = true;
    });

  function setStatus(message, type = 'info') {
    statusElement.textContent = message;
    statusElement.classList.remove('info', 'success', 'error');
    statusElement.classList.add(type);
  }

  function formatFileSize(bytes) {
    if (!Number.isFinite(bytes)) {
      return '';
    }
    const units = ['B', 'KB', 'MB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
    }
    return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  }

  function resetResults() {
    resultsContainer.innerHTML = '<p class="placeholder">Cuando el análisis termine aparecerá aquí un enlace para descargar el MusicXML.</p>';
    analysisDetails.innerHTML = '';
    analysisDetails.classList.add('hidden');
    previewStatusElement.textContent = 'Aún no hay ningún archivo para mostrar.';
    previewStatusElement.classList.remove('success', 'error');
    previewStatusElement.classList.add('info');
    previewContentElement.innerHTML = '<p class="placeholder">Genera un MusicXML para ver la partitura renderizada aquí mismo.</p>';
  }

  function handleSelectedFile(file) {
    if (!(file instanceof File)) {
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setStatus('El archivo supera el límite de 8 MB. Selecciona una imagen más ligera.', 'error');
      selectedFile = null;
      dropZone.classList.remove('has-file');
      selectedFileInfo.textContent = '';
      selectedFileInfo.classList.add('hidden');
      resetResults();
      return;
    }

    const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_MIME_TYPES.has(file.type) && !ALLOWED_EXTENSIONS.has(extension)) {
      setStatus('Solo se admiten imágenes PNG o JPG. Intenta convertir la partitura a uno de esos formatos.', 'error');
      selectedFile = null;
      dropZone.classList.remove('has-file');
      selectedFileInfo.textContent = '';
      selectedFileInfo.classList.add('hidden');
      resetResults();
      return;
    }

    selectedFile = file;
    dropZone.classList.add('has-file');
    selectedFileInfo.textContent = `Archivo seleccionado: ${file.name} (${formatFileSize(file.size)})`;
    selectedFileInfo.classList.remove('hidden');
    setStatus('Archivo listo. Pulsa “Procesar partitura” para iniciar el análisis.', 'info');
  }

  async function loadImageBitmap(file) {
    if (window.createImageBitmap) {
      try {
        return await window.createImageBitmap(file, { imageOrientation: 'from-image' });
      } catch (error) {
        console.warn('No se pudo usar createImageBitmap, se usará un lector alternativo.', error);
      }
    }

    return new Promise((resolve, reject) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(file);
      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(image);
      };
      image.onerror = (event) => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('No se pudo leer la imagen seleccionada.'));
      };
      image.src = objectUrl;
    });
  }

  async function processCurrentScore() {
    if (!selectedFile) {
      setStatus('Selecciona primero una imagen de partitura.', 'error');
      return;
    }

    processButton.disabled = true;

    try {
      await cvReadyPromise;
      setStatus('Preparando la imagen para el análisis…', 'info');
      resetResults();

      const imageSource = await loadImageBitmap(selectedFile);
      setStatus('Detectando pentagramas y notas…', 'info');
      const startTime = performance.now();
      const analysis = await analyseScore(imageSource, selectedFile.name);
      const elapsed = performance.now() - startTime;

      setStatus(
        `Listo. Se detectaron ${analysis.notes.length === 1 ? '1 nota' : `${analysis.notes.length} notas`} en ${elapsed.toFixed(
          0,
        )} ms.`,
        'success',
      );

      const downloadData = renderResults(analysis, selectedFile);
      renderAnalysisDetails(analysis);
      await renderPreview(analysis.xml);
      addConversionToHistory({
        timestamp: new Date(),
        originalName: selectedFile.name,
        notes: analysis.notes,
        downloadUrl: downloadData.url,
        downloadName: downloadData.filename,
      });
    } catch (error) {
      console.error(error);
      setStatus(error.message || 'Algo salió mal durante el análisis.', 'error');
    } finally {
      processButton.disabled = false;
    }
  }

  function renderResults(analysis, file) {
    resultsContainer.innerHTML = '';

    const safeTitle = sanitiseTitle(file?.name);
    const blob = new Blob([analysis.xml], {
      type: 'application/vnd.recordare.musicxml+xml',
    });
    const objectUrl = URL.createObjectURL(blob);
    generatedObjectUrls.add(objectUrl);

    const downloadLink = document.createElement('a');
    downloadLink.href = objectUrl;
    downloadLink.download = `${createSlug(safeTitle)}.musicxml`;
    downloadLink.className = 'download-link';
    downloadLink.innerHTML = '<span aria-hidden="true">⬇️</span><span>Descargar MusicXML</span>';

    const summary = document.createElement('p');
    summary.textContent =
      analysis.notes.length === 1
        ? 'Se detectó una nota negra.'
        : `Se detectaron ${analysis.notes.length} notas negras consecutivas.`;

    resultsContainer.append(downloadLink, summary);

    if (analysis.overlayUrl) {
      const figure = document.createElement('figure');
      const image = document.createElement('img');
      image.src = analysis.overlayUrl;
      image.alt = 'Visualización con las líneas y notas detectadas.';
      figure.appendChild(image);
      const caption = document.createElement('figcaption');
      caption.textContent = 'Líneas de pentagrama y centros de nota identificados por el algoritmo en tu navegador.';
      figure.appendChild(caption);
      resultsContainer.appendChild(figure);
    }

    return { url: objectUrl, filename: `${createSlug(safeTitle)}.musicxml` };
  }

  function renderAnalysisDetails(analysis) {
    if (!analysis.notes.length) {
      analysisDetails.innerHTML =
        '<p>No se encontraron notas reconocibles. Asegúrate de que la imagen sea clara y contenga una sola voz.</p>';
      analysisDetails.classList.remove('hidden');
      return;
    }

    const list = document.createElement('ul');
    analysis.notes.forEach((note) => {
      const item = document.createElement('li');
      item.textContent = `Compás ${note.measure}, tiempo ${note.beat}: ${note.pitch.step}${note.pitch.octave}`;
      list.appendChild(item);
    });

    analysisDetails.innerHTML = '<p>Alturas detectadas en orden de aparición:</p>';
    analysisDetails.appendChild(list);
    analysisDetails.classList.remove('hidden');
  }

  async function renderPreview(xml) {
    const toolkit = await verovioToolkitPromise;
    if (!toolkit) {
      previewStatusElement.textContent = 'El visor integrado no está disponible. Descarga el MusicXML para revisarlo.';
      previewStatusElement.classList.remove('info', 'success');
      previewStatusElement.classList.add('error');
      previewContentElement.innerHTML = '<p class="placeholder">Puedes abrir el archivo en MuseScore, Dorico o Finale.</p>';
      return;
    }

    try {
      toolkit.setOptions({
        scale: 50,
        pageHeight: 2970,
        pageWidth: 2100,
        adjustPageHeight: true,
      });
      const svg = toolkit.renderData(xml, { page: 1 });
      previewStatusElement.textContent = 'Previsualización generada con Verovio.';
      previewStatusElement.classList.remove('info', 'error');
      previewStatusElement.classList.add('success');
      previewContentElement.innerHTML = svg;
    } catch (error) {
      console.error('Error al renderizar con Verovio:', error);
      previewStatusElement.textContent = 'No se pudo renderizar el MusicXML automáticamente.';
      previewStatusElement.classList.remove('info', 'success');
      previewStatusElement.classList.add('error');
      previewContentElement.innerHTML = '<p class="placeholder">Descarga el archivo y ábrelo con tu editor favorito.</p>';
    }
  }

  function addConversionToHistory(entry) {
    conversions.unshift(entry);
    if (conversions.length > 5) {
      const removed = conversions.pop();
      if (removed?.downloadUrl) {
        try {
          URL.revokeObjectURL(removed.downloadUrl);
          generatedObjectUrls.delete(removed.downloadUrl);
        } catch (error) {
          console.warn('No se pudo liberar un resultado antiguo.', error);
        }
      }
    }
    renderHistory();
  }

  function renderHistory() {
    if (!conversions.length) {
      historyContainer.innerHTML = '<p class="placeholder">Tus últimas conversiones aparecerán en esta lista.</p>';
      return;
    }

    historyContainer.innerHTML = '';
    conversions.forEach((conversion, index) => {
      const card = document.createElement('article');
      card.className = 'history-card';

      const title = document.createElement('h3');
      title.textContent = sanitiseTitle(conversion.originalName);
      card.appendChild(title);

      const time = document.createElement('time');
      time.dateTime = conversion.timestamp.toISOString();
      time.textContent = historyDateFormatter.format(conversion.timestamp);
      card.appendChild(time);

      const notesLine = document.createElement('p');
      notesLine.className = 'note-list';
      notesLine.textContent = conversion.notes.length
        ? conversion.notes.map((note) => `${note.pitch.step}${note.pitch.octave}`).join(', ')
        : 'Sin notas detectadas';
      card.appendChild(notesLine);

      const link = document.createElement('a');
      link.href = conversion.downloadUrl;
      link.download = conversion.downloadName;
      link.className = 'download-link';
      link.innerHTML = '<span aria-hidden="true">↺</span><span>Descargar nuevamente</span>';
      card.appendChild(link);

      historyContainer.appendChild(card);
    });
  }

  async function analyseScore(imageSource, fileName) {
    await cvReadyPromise;

    const canvas = document.createElement('canvas');
    canvas.width = imageSource.width;
    canvas.height = imageSource.height;
    const context = canvas.getContext('2d');
    context.drawImage(imageSource, 0, 0);
    if (typeof imageSource.close === 'function') {
      imageSource.close();
    }

    const src = cv.imread(canvas);
    const grayscale = new cv.Mat();
    cv.cvtColor(src, grayscale, cv.COLOR_RGBA2GRAY, 0);

    const blurred = new cv.Mat();
    cv.GaussianBlur(grayscale, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);

    const binary = new cv.Mat();
    cv.adaptiveThreshold(
      blurred,
      binary,
      255,
      cv.ADAPTIVE_THRESH_MEAN_C,
      cv.THRESH_BINARY_INV,
      15,
      8,
    );

    const horizontal = new cv.Mat();
    const horizontalKernelSize = Math.max(15, Math.round(src.cols / 18));
    const horizontalKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(horizontalKernelSize, 1));
    cv.erode(binary, horizontal, horizontalKernel);
    cv.dilate(horizontal, horizontal, horizontalKernel);

    const withoutStaff = new cv.Mat();
    cv.subtract(binary, horizontal, withoutStaff);

    const cleanKernelSize = Math.max(3, Math.round(src.cols / 120));
    const noteKernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(cleanKernelSize, cleanKernelSize));
    const cleaned = new cv.Mat();
    cv.morphologyEx(withoutStaff, cleaned, cv.MORPH_OPEN, noteKernel);

    const staffInfo = detectStaffLines(horizontal);
    if (!staffInfo || staffInfo.lines.length < 5 || !Number.isFinite(staffInfo.spacing)) {
      disposeMats(src, grayscale, blurred, binary, horizontal, horizontalKernel, withoutStaff, noteKernel, cleaned);
      throw new Error('No se detectaron suficientes líneas de pentagrama. Usa una imagen con mayor contraste.');
    }

    const noteComponents = detectNoteComponents(cleaned, staffInfo.lines, staffInfo.spacing, src.cols, src.rows);
    if (!noteComponents.length) {
      disposeMats(src, grayscale, blurred, binary, horizontal, horizontalKernel, withoutStaff, noteKernel, cleaned);
      throw new Error('No se encontraron cabezas de nota claras. Comprueba la nitidez de la partitura.');
    }

    noteComponents.sort((a, b) => a.cx - b.cx);
    const notes = noteComponents.map((component, index) => {
      const stepsFromBase = Math.round((staffInfo.lines[4] - component.cy) / (staffInfo.spacing / 2));
      const pitch = pitchFromOffset(stepsFromBase);
      return {
        pitch,
        cx: component.cx,
        cy: component.cy,
        offset: stepsFromBase,
        measure: Math.floor(index / 4) + 1,
        beat: (index % 4) + 1,
      };
    });

    const xml = buildMusicXml(notes, fileName);
    const overlayUrl = createOverlayImage(canvas, staffInfo.lines, notes, staffInfo.spacing);

    disposeMats(src, grayscale, blurred, binary, horizontal, horizontalKernel, withoutStaff, noteKernel, cleaned);

    return {
      xml,
      notes,
      staffLines: staffInfo.lines,
      spacing: staffInfo.spacing,
      overlayUrl,
    };
  }

  function disposeMats(...mats) {
    mats.forEach((mat) => {
      if (mat && typeof mat.delete === 'function') {
        mat.delete();
      }
    });
  }

  function detectStaffLines(horizontalMat) {
    const rows = horizontalMat.rows;
    const cols = horizontalMat.cols;
    const lineScores = new Array(rows).fill(0);

    for (let y = 0; y < rows; y += 1) {
      let sum = 0;
      for (let x = 0; x < cols; x += 1) {
        if (horizontalMat.ucharPtr(y, x)[0] > 0) {
          sum += 1;
        }
      }
      lineScores[y] = sum;
    }

    const maxScore = Math.max(...lineScores);
    if (!Number.isFinite(maxScore) || maxScore === 0) {
      return null;
    }

    const threshold = maxScore * 0.6;
    const candidates = [];
    for (let y = 0; y < rows; y += 1) {
      if (lineScores[y] >= threshold) {
        candidates.push(y);
      }
    }

    if (!candidates.length) {
      return null;
    }

    const clusters = [];
    let cluster = [candidates[0]];
    for (let i = 1; i < candidates.length; i += 1) {
      const current = candidates[i];
      const previous = candidates[i - 1];
      if (current - previous <= 1) {
        cluster.push(current);
      } else {
        clusters.push(cluster);
        cluster = [current];
      }
    }
    clusters.push(cluster);

    const positions = clusters.map((group) => Math.round(group.reduce((sum, value) => sum + value, 0) / group.length));
    positions.sort((a, b) => a - b);

    if (positions.length < 5) {
      return null;
    }

    let bestGroup = null;
    for (let i = 0; i <= positions.length - 5; i += 1) {
      const group = positions.slice(i, i + 5);
      const gaps = [];
      for (let j = 1; j < group.length; j += 1) {
        gaps.push(group[j] - group[j - 1]);
      }
      const mean = gaps.reduce((sum, value) => sum + value, 0) / gaps.length;
      if (mean <= 0) {
        continue;
      }
      const deviation = gaps.reduce((sum, value) => sum + Math.abs(value - mean), 0) / gaps.length;
      const score = deviation / mean;
      if (!bestGroup || score < bestGroup.score) {
        bestGroup = {
          lines: group,
          spacing: mean,
          score,
        };
      }
    }

    if (!bestGroup) {
      return {
        lines: positions.slice(0, 5),
        spacing: (positions[4] - positions[0]) / 4,
        score: 1,
      };
    }

    return bestGroup;
  }

  function detectNoteComponents(image, staffLines, spacing, width, height) {
    const labels = new cv.Mat();
    const stats = new cv.Mat();
    const centroids = new cv.Mat();
    const components = [];

    try {
      const count = cv.connectedComponentsWithStats(image, labels, stats, centroids, 8, cv.CV_32S);
      const statsData = stats.data32S;
      const centroidsData = centroids.data64F;

      const minArea = Math.max(12, spacing * spacing * 0.25);
      const maxArea = spacing * spacing * 3.2;
      const minY = staffLines[0] - spacing * 4;
      const maxY = staffLines[4] + spacing * 4;

      for (let i = 1; i < count; i += 1) {
        const area = statsData[i * stats.cols + cv.CC_STAT_AREA];
        const widthComponent = statsData[i * stats.cols + cv.CC_STAT_WIDTH];
        const heightComponent = statsData[i * stats.cols + cv.CC_STAT_HEIGHT];
        const left = statsData[i * stats.cols + cv.CC_STAT_LEFT];
        const top = statsData[i * stats.cols + cv.CC_STAT_TOP];
        const cx = centroidsData[i * centroids.cols];
        const cy = centroidsData[i * centroids.cols + 1];

        if (area < minArea || area > maxArea) {
          continue;
        }
        if (heightComponent > spacing * 2.6 || heightComponent < spacing * 0.45) {
          continue;
        }
        if (widthComponent > spacing * 2.6 || widthComponent < spacing * 0.45) {
          continue;
        }
        if (cy < minY || cy > maxY) {
          continue;
        }
        if (left <= 0 || left + widthComponent >= width) {
          continue;
        }
        if (top <= 0 || top + heightComponent >= height) {
          continue;
        }

        components.push({
          area,
          width: widthComponent,
          height: heightComponent,
          x: left,
          y: top,
          cx,
          cy,
        });
      }
    } finally {
      labels.delete();
      stats.delete();
      centroids.delete();
    }

    return components;
  }

  function pitchFromOffset(offsetSteps) {
    const letters = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
    const baseDiatonic = 4 * 7 + 2; // E4
    let diatonic = baseDiatonic + offsetSteps;
    let octave = Math.floor(diatonic / 7);
    let letterIndex = diatonic % 7;

    if (letterIndex < 0) {
      letterIndex += 7;
      octave -= 1;
    }

    const step = letters[letterIndex];
    return { step, octave };
  }

  function buildMusicXml(notes, fileName) {
    const title = sanitiseTitle(fileName);
    const escapedTitle = escapeXml(title);
    const workNumber = Date.now().toString();

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<!DOCTYPE score-partwise PUBLIC \"-//Recordare//DTD MusicXML 3.1 Partwise//EN\" \"http://www.musicxml.org/dtds/partwise.dtd\">\n`;
    xml += `<score-partwise version="3.1">\n`;
    xml += `  <work>\n`;
    xml += `    <work-number>${workNumber}</work-number>\n`;
    xml += `    <work-title>${escapedTitle}</work-title>\n`;
    xml += `  </work>\n`;
    xml += `  <identification>\n`;
    xml += `    <encoding>\n`;
    xml += `      <encoding-date>${new Date().toISOString().split('T')[0]}</encoding-date>\n`;
    xml += `      <software>Music Scanner (cliente 100 % navegador)</software>\n`;
    xml += `    </encoding>\n`;
    xml += `  </identification>\n`;
    xml += `  <part-list>\n`;
    xml += `    <score-part id="P1">\n`;
    xml += `      <part-name>Instrumento</part-name>\n`;
    xml += `    </score-part>\n`;
    xml += `  </part-list>\n`;
    xml += `  <part id="P1">\n`;

    if (!notes.length) {
      xml += `    <measure number="1">\n`;
      xml += `      <attributes>\n`;
      xml += `        <divisions>1</divisions>\n`;
      xml += `        <key><fifths>0</fifths></key>\n`;
      xml += `        <time><beats>4</beats><beat-type>4</beat-type></time>\n`;
      xml += `        <clef><sign>G</sign><line>2</line></clef>\n`;
      xml += `      </attributes>\n`;
      xml += `      <note>\n`;
      xml += `        <rest/>\n`;
      xml += `        <duration>4</duration>\n`;
      xml += `        <type>whole</type>\n`;
      xml += `      </note>\n`;
      xml += `    </measure>\n`;
      xml += `  </part>\n`;
      xml += `</score-partwise>\n`;
      return xml;
    }

    let currentIndex = 0;
    let measureNumber = 1;

    while (currentIndex < notes.length) {
      const measureNotes = notes.slice(currentIndex, currentIndex + 4);
      xml += `    <measure number="${measureNumber}">\n`;
      if (measureNumber === 1) {
        xml += `      <attributes>\n`;
        xml += `        <divisions>1</divisions>\n`;
        xml += `        <key><fifths>0</fifths></key>\n`;
        xml += `        <time><beats>4</beats><beat-type>4</beat-type></time>\n`;
        xml += `        <clef><sign>G</sign><line>2</line></clef>\n`;
        xml += `      </attributes>\n`;
      }

      measureNotes.forEach((note) => {
        xml += `      <note>\n`;
        xml += `        <pitch>\n`;
        xml += `          <step>${note.pitch.step}</step>\n`;
        xml += `          <octave>${note.pitch.octave}</octave>\n`;
        xml += `        </pitch>\n`;
        xml += `        <duration>1</duration>\n`;
        xml += `        <type>quarter</type>\n`;
        xml += `      </note>\n`;
      });

      xml += `    </measure>\n`;
      currentIndex += measureNotes.length;
      measureNumber += 1;
    }

    xml += `  </part>\n`;
    xml += `</score-partwise>\n`;
    return xml;
  }

  function createOverlayImage(canvas, staffLines, notes, spacing) {
    try {
      const overlay = document.createElement('canvas');
      overlay.width = canvas.width;
      overlay.height = canvas.height;
      const ctx = overlay.getContext('2d');
      ctx.drawImage(canvas, 0, 0);

      ctx.lineWidth = Math.max(2, spacing / 4);
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.9)';
      staffLines.forEach((y) => {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      });

      ctx.fillStyle = 'rgba(34, 211, 238, 0.85)';
      notes.forEach((note) => {
        ctx.beginPath();
        ctx.arc(note.cx, note.cy, Math.max(4, spacing / 3), 0, Math.PI * 2);
        ctx.fill();
      });

      return overlay.toDataURL('image/png');
    } catch (error) {
      console.warn('No se pudo crear la imagen de depuración.', error);
      return null;
    }
  }

  function sanitiseTitle(name) {
    if (typeof name !== 'string' || !name.trim()) {
      return 'Partitura convertida';
    }
    const withoutExtension = name.replace(/\.[^.]+$/, '');
    const clean = withoutExtension.replace(/[_-]+/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, '').trim();
    return clean || 'Partitura convertida';
  }

  function createSlug(name) {
    return sanitiseTitle(name)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-')
      || 'partitura';
  }

  function escapeXml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  dropZone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropZone.classList.remove('dragover');
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      handleSelectedFile(file);
    }
  });

  dropZone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      fileInput.click();
    }
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) {
      handleSelectedFile(file);
    }
  });

  processButton.addEventListener('click', () => {
    processCurrentScore();
  });

  resetResults();
})();
