# Hoja de ruta para el reconocimiento avanzado de partituras

Esta hoja de ruta desglosa el desarrollo de un motor de reconocimiento óptico de partituras con máxima precisión, preparado para partituras polifónicas extensas y documentos PDF multipágina. Cada bloque incluye las tareas principales y las pruebas mínimas necesarias antes de avanzar al siguiente.

## 1. Preparar pipeline de entrada robusto
- [x] Implementar ingesta de archivos PDF, imágenes escaneadas y fotografías en `src/io/`.
- [x] Integrar conversión de PDF a imagen y normalización de DPI en `src/preprocess/normalize.py`.
- [x] Añadir detección y corrección de inclinación con OpenCV (`deskew_image`).
- [x] Configurar pipeline de preprocesamiento con denoise, corrección de iluminación y binarización adaptativa.

### Pruebas
- [x] Crear pruebas unitarias en `tests/test_preprocess.py` para validar la normalización de DPI y la corrección de inclinación.
- [x] Generar fixtures de imágenes ruidosas y PDF de ejemplo en `tests/fixtures/preprocess/` y verificar la salida esperada.

## 2. Segregar pentagramas y sistemas
- [x] Detectar márgenes y cabeceras (títulos, notas de texto) en `src/layout/detect_headers.py`.
- [x] Desarrollar segmentador de sistemas musicales mediante detección de líneas de pentagrama (`src/layout/staff_detection.py`).
- [x] Implementar agrupación de pentagramas en sistemas por claves y corchetes.

### Pruebas
- [x] Añadir pruebas de integración en `tests/layout/test_staff_detection.py` con imágenes de diferentes formatos de página.
- [x] Incluir pruebas de regresión visual automatizadas comparando máscaras generadas con fixtures en `tests/fixtures/layout/`.

## 3. Rectificar y alinear pentagramas
- [x] Crear funciones para enderezar líneas onduladas (warping) en `src/layout/staff_rectifier.py`.
- [x] Establecer referencia de altura entre líneas y espacios para cuantificar la posición vertical.
- [x] Ajustar contraste y grosor de líneas mediante operaciones morfológicas.

### Pruebas
- [x] Incorporar pruebas numéricas que validen la desviación máxima permitida tras la rectificación (`tests/layout/test_rectifier.py`).
- [x] Ejecutar pruebas E2E con pentagramas curvos para garantizar la correcta alineación antes de continuar.

## 4. Modelo de detección y clasificación de símbolos
- Definir dataset etiquetado de símbolos musicales en `data/symbols/`.
- Entrenar detector (por ejemplo, YOLOv8) en `src/models/detector.py` con augmentations polifónicas.
- Crear clasificador secundario para variantes de figuras y articulaciones en `src/models/classifier.py`.
- Integrar postprocesamiento para eliminar duplicados y validar solapamientos.

### Pruebas
- Configurar pruebas de entrenamiento reproducible (`tests/models/test_detector_training.py`) que verifiquen pérdida inicial y final.
- Añadir evaluación automatizada en `tests/models/test_detector_metrics.py` con un subconjunto validado manualmente.

## 5. Inferir pitch y duración de notas
- Mapear la posición vertical relativa para obtener alturas (`src/analysis/pitch_mapper.py`).
- Reconocer alteraciones y armaduras de clave para actualizar el contexto tonal.
- Analizar duraciones a partir de cabezas, plicas y corchetes en `src/analysis/rhythm_analyzer.py`.
- Gestionar indicaciones de compás y tempo para validar consistencia temporal.

### Pruebas
- Implementar pruebas paramétricas en `tests/analysis/test_pitch_mapper.py` con ejemplos de distintas claves y octavas.
- Incluir casos de integración en `tests/analysis/test_rhythm_analyzer.py` comprobando la suma total de tiempos por compás.

## 6. Resolver voces simultáneas
- Diseñar algoritmo de asignación de voces por columnas temporales en `src/analysis/polyphony_resolver.py`.
- Detectar acordes, arpegios y ligaduras de prolongación.
- Manejar voces cruzadas y cambios de clave interlineales.

### Pruebas
- Crear suites de pruebas con partituras polifónicas complejas (`tests/fixtures/polyphony/`).
- Añadir pruebas de consistencia en `tests/analysis/test_polyphony_resolver.py` que aseguren que cada voz mantiene continuidad temporal.

## 7. Soporte para articulaciones y expresiones avanzadas
- Detectar dinámicas, textos expresivos y marcas de repetición en `src/analysis/expressions.py`.
- Reconocer ornamentos como trinos, glissandos, mordentes y adornos especiales.
- Incorporar notación contemporánea: compases irregulares, tablaturas y microtonos.

### Pruebas
- Definir pruebas de cobertura de símbolos en `tests/analysis/test_expressions.py` asegurando detección mínima aceptable.
- Añadir validaciones manuales asistidas (golden files) para símbolos poco frecuentes.

## 8. Generar representación musical estructurada
- Diseñar modelo de datos jerárquico en `src/schema/score.py` (pieza → movimientos → compases → voces → eventos).
- Implementar exportadores a MusicXML, MIDI y JSON en `src/export/`.
- Validar integridad de compases y correspondencia entre voces.

### Pruebas
- Crear pruebas unitarias para el modelo de datos (`tests/schema/test_score_model.py`).
- Implementar pruebas de exportación (`tests/export/test_musicxml_exporter.py`, etc.) que comparen con archivos esperados en `tests/fixtures/export/`.

## 9. Procesar partituras multi-página
- Desarrollar pipeline que ordene páginas y detecte números o cabeceras repetidas.
- Unificar información de armaduras y compases a lo largo de todas las páginas.
- Alinear compases consecutivos para garantizar continuidad al exportar.

### Pruebas
- Preparar colección de PDFs multipágina en `tests/fixtures/multipage/`.
- Ejecutar pruebas de integración (`tests/pipeline/test_multipage_pipeline.py`) que validen la continuidad de compases y metadatos.

## 10. Diseñar evaluación exhaustiva
- Construir suite de evaluación con partituras diversas en `tests/fixtures/benchmark/`.
- Medir precisión por símbolo, exactitud de pitch/duración e integridad de compases.
- Integrar benchmarks automáticos en CI (`scripts/run_benchmarks.py`).

### Pruebas
- Configurar pruebas de regresión (`tests/benchmark/test_regressions.py`) que aseguren que las métricas no caigan por debajo de umbrales definidos.
- Automatizar reportes de resultados en CI para cada push.

## 11. Optimizar y preparar despliegue
- Afinar rendimiento con batching y soporte GPU en `src/pipeline/runner.py`.
- Empaquetar el modelo para ejecución local y en la nube (Docker, ONNX).
- Documentar uso avanzado y parámetros en `docs/`.

### Pruebas
- Ejecutar pruebas de rendimiento (`tests/performance/test_throughput.py`) con diferentes tamaños de lote.
- Añadir validaciones de empaquetado (por ejemplo, `scripts/test_docker_build.sh`) en la pipeline de CI antes del despliegue.
