# Dataset de símbolos musicales

Este directorio define la estructura base del dataset etiquetado utilizado para entrenar los modelos de detección y clasificación de la fase 4. Cada símbolo anotado proviene de fragmentos de partitura normalizados durante el preprocesamiento y se describe mediante anotaciones compatibles con formato COCO.

## Estructura de carpetas

```
data/symbols/
├── annotations/
│   ├── train.json
│   ├── val.json
│   └── test.json
├── images/
│   ├── train/
│   ├── val/
│   └── test/
└── taxonomies/
    └── symbol_labels.json
```

- `images/`: contendrá los recortes de pentagramas anotados. Los subdirectorios se reservan para las particiones de entrenamiento, validación y prueba.
- `annotations/`: almacenará los archivos JSON con las anotaciones en formato COCO, incluyendo bounding boxes, etiquetas y metadatos adicionales.
- `taxonomies/symbol_labels.json`: define el catálogo de clases admitidas y su correspondencia con identificadores numéricos.

## Convenciones de anotación

1. **Formato**: utilizamos COCO con anotaciones por instancia. Cada símbolo aislado se representa con una bounding box orientada al eje y la etiqueta correspondiente.
2. **Sistema de coordenadas**: las coordenadas `x`, `y`, `width`, `height` se expresan en píxeles, relativas al origen en la esquina superior izquierda de cada imagen.
3. **Clases mínimas**: ver el archivo `taxonomies/symbol_labels.json` para la lista inicial de 32 clases, que cubre figuras rítmicas básicas, silencios, alteraciones, claves, armaduras y articulaciones más frecuentes.
4. **Metadatos**: cada anotación debe incluir campos `staff_id` y `voice_hint` para facilitar la fase de resolución polifónica.
5. **Validación**: antes de añadir un nuevo lote, ejecutar `python -m src.data.validate_symbols` (se implementará en fases posteriores) para asegurar integridad y cobertura mínima por clase.

## Próximos pasos

- Poblar `images/` y `annotations/` con lotes iniciales extraídos de partituras de dominio público.
- Automatizar la generación de recortes y anotaciones desde partituras completas usando los pipelines de layout ya implementados.
- Documentar en `docs/datasets.md` el procedimiento de contribución y las fuentes permitidas.
