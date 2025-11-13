"""Servicios para ejecutar el motor OMR y gestionar resultados MusicXML."""

from __future__ import annotations

import logging
import shlex
import shutil
import subprocess
import tempfile
import textwrap
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

from app.core import settings

logger = logging.getLogger(__name__)


class OMRProcessingError(RuntimeError):
    """Excepción base para errores durante el procesamiento OMR."""


@dataclass(slots=True)
class OMRResult:
    """Representa el resultado exitoso de un procesamiento OMR."""

    result_id: str
    musicxml_path: Path
    processing_mode: str
    page_number: int | None = None
    total_pages: int | None = None
    applied_arguments: tuple[str, ...] = field(default_factory=tuple)


def run_omr(
    input_path: Path,
    *,
    page: int | None = None,
    processing_mode: str | None = None,
    extra_cli_arguments: Iterable[str] | str | None = None,
) -> OMRResult:
    """Ejecuta el flujo de OMR y devuelve un resultado listo para descargar.

    El procesamiento intentará utilizar Audiveris si se ha configurado un comando
    válido. En caso contrario, o si se produce un error y ``enable_stub_omr`` es
    ``True``, se generará un archivo MusicXML ficticio para mantener operativo el
    flujo de extremo a extremo. Además, permite ajustar el modo de procesamiento
    y añadir argumentos adicionales a la ejecución.
    """

    if not input_path.exists():
        raise OMRProcessingError(
            f"El archivo de entrada '{input_path}' no existe o fue eliminado antes de ejecutar OMR."
        )

    selected_mode = (processing_mode or settings.default_processing_mode).strip().lower()
    available_modes = settings.audiveris_processing_presets
    if selected_mode not in available_modes:
        raise OMRProcessingError(
            f"El modo de procesamiento '{selected_mode}' no está configurado en el backend."
        )

    preset_arguments = _normalize_cli_arguments(available_modes.get(selected_mode))
    user_arguments = _normalize_cli_arguments(extra_cli_arguments)
    effective_arguments = [*preset_arguments, *user_arguments]

    prepared_path, page_number, total_pages = _prepare_input_for_omr(input_path, page)
    source_name = input_path.name

    try:
        if settings.audiveris_command:
            musicxml_path = _run_with_audiveris(
                prepared_path,
                extra_arguments=effective_arguments,
            )
        else:
            raise OMRProcessingError(
                "No se configuró el comando de Audiveris. Se utilizará un resultado ficticio."
            )
    except OMRProcessingError as exc:
        if not settings.enable_stub_omr:
            raise
        logger.warning("Fallo al ejecutar Audiveris: %s", exc)
        musicxml_path = _generate_stub_result(
            source_name,
            page_number=page_number,
            processing_mode=selected_mode,
            cli_arguments=effective_arguments,
        )
    finally:
        if prepared_path is not input_path:
            prepared_path.unlink(missing_ok=True)

    result_id, stored_path = _store_musicxml_result(musicxml_path)
    return OMRResult(
        result_id=result_id,
        musicxml_path=stored_path,
        processing_mode=selected_mode,
        page_number=page_number,
        total_pages=total_pages,
        applied_arguments=tuple(effective_arguments),
    )


def resolve_musicxml_path(result_id: str) -> Path:
    """Devuelve la ruta del archivo MusicXML asociado a ``result_id``."""

    if not result_id or not _is_safe_identifier(result_id):
        raise FileNotFoundError(result_id)

    target_path = settings.results_dir / f"{result_id}.musicxml"
    if not target_path.exists():
        raise FileNotFoundError(result_id)
    return target_path


def _prepare_input_for_omr(
    input_path: Path, page: int | None
) -> tuple[Path, int | None, int | None]:
    """Normaliza el archivo de entrada para Audiveris, extrayendo páginas si es necesario."""

    if input_path.suffix.lower() != ".pdf":
        if page is not None and page < 1:
            raise OMRProcessingError("El número de página debe ser mayor o igual a 1.")
        normalized_page = page if page and page > 0 else None
        return input_path, normalized_page, None

    return _extract_pdf_page(input_path, page)


def _run_with_audiveris(
    input_path: Path,
    *,
    extra_arguments: Iterable[str] | None = None,
) -> Path:
    """Invoca Audiveris mediante CLI y devuelve la ruta temporal del MusicXML."""

    output_dir = Path(tempfile.mkdtemp(prefix="omr_audiveris_"))
    command = [
        *settings.audiveris_command,
        "-batch",
        "-export",
    ]

    if extra_arguments:
        command.extend(str(argument).strip() for argument in extra_arguments if str(argument).strip())

    command.extend([
        "-output",
        str(output_dir),
        str(input_path),
    ])

    logger.info("Ejecutando Audiveris: %s", " ".join(command))

    try:
        subprocess.run(
            command,
            check=True,
            capture_output=True,
            text=True,
            timeout=settings.audiveris_timeout,
        )
    except FileNotFoundError as exc:
        raise OMRProcessingError("No se encontró el ejecutable de Audiveris configurado.") from exc
    except subprocess.TimeoutExpired as exc:
        raise OMRProcessingError("El procesamiento con Audiveris excedió el tiempo máximo permitido.") from exc
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.strip() if exc.stderr else "Audiveris devolvió un error desconocido."
        raise OMRProcessingError(stderr) from exc

    musicxml_file = _pick_musicxml_file(output_dir)
    if musicxml_file is None:
        raise OMRProcessingError(
            "No se encontró un archivo MusicXML en la salida generada por Audiveris."
        )

    with tempfile.NamedTemporaryFile(delete=False, suffix=".musicxml") as tmp_file:
        tmp_path = Path(tmp_file.name)
    shutil.copy2(musicxml_file, tmp_path)
    shutil.rmtree(output_dir, ignore_errors=True)
    return tmp_path



def _extract_pdf_page(original_path: Path, page: int | None) -> tuple[Path, int, int]:
    """Extrae una única página de un PDF para enviarla a Audiveris."""

    from pypdf import PdfReader, PdfWriter

    try:
        reader = PdfReader(str(original_path))
    except Exception as exc:  # pragma: no cover - dependencias externas
        raise OMRProcessingError("No se pudo leer el PDF proporcionado.") from exc

    total_pages = len(reader.pages)
    if total_pages == 0:
        raise OMRProcessingError("El PDF proporcionado no contiene páginas.")

    target_page = 1 if page is None else page
    if target_page < 1:
        raise OMRProcessingError("El número de página debe ser mayor o igual a 1.")
    if target_page > total_pages:
        raise OMRProcessingError(
            f"La página solicitada ({target_page}) está fuera de rango. El PDF tiene {total_pages} páginas."
        )

    writer = PdfWriter()
    writer.add_page(reader.pages[target_page - 1])

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_file:
        writer.write(tmp_file)
        temp_path = Path(tmp_file.name)

    return temp_path, target_page, total_pages



def _generate_stub_result(
    source_name: str,
    *,
    page_number: int | None = None,
    processing_mode: str | None = None,
    cli_arguments: Iterable[str] | None = None,
) -> Path:
    """Genera un archivo MusicXML mínimo para mantener el flujo funcional."""

    normalized_arguments = _normalize_cli_arguments(cli_arguments)
    arguments_text = " ".join(normalized_arguments)

    encoding_lines = []
    if processing_mode:
        encoding_lines.append(
            f"        <software>Modo de reconocimiento: {processing_mode}</software>"
        )
    if page_number:
        encoding_lines.append(
            f"        <software>Página solicitada: {page_number}</software>"
        )
    if arguments_text:
        encoding_lines.append(
            f"        <software>Parámetros adicionales: {arguments_text}</software>"
        )

    encoding_block = ""
    if encoding_lines:
        encoding_block = "\n".join(["      <encoding>", *encoding_lines, "      </encoding>"])

    stub_content = textwrap.dedent(
        f"""
            <?xml version="1.0" encoding="UTF-8"?>
            <!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN"
              "http://www.musicxml.org/dtds/partwise.dtd">
            <score-partwise version="4.0">
              <work>
                <work-title>Resultado ficticio para {source_name}</work-title>
              </work>
              <identification>
                <creator type="software">Music Scanner (modo demostración)</creator>
                {encoding_block}
              </identification>
              <part-list>
                <score-part id="P1">
                  <part-name>Parte 1</part-name>
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
                </measure>
              </part>
            </score-partwise>
            """
    ).strip()

    with tempfile.NamedTemporaryFile(delete=False, suffix=".musicxml", mode="w", encoding="utf-8") as tmp_file:
        tmp_file.write(stub_content + "\n")
        return Path(tmp_file.name)




def _store_musicxml_result(musicxml_path: Path) -> tuple[str, Path]:
    """Mueve el archivo MusicXML generado a la carpeta de resultados definitiva."""

    if not musicxml_path.exists():
        raise OMRProcessingError("El archivo MusicXML indicado no existe.")

    settings.results_dir.mkdir(parents=True, exist_ok=True)
    result_id = uuid.uuid4().hex
    destination = settings.results_dir / f"{result_id}.musicxml"
    shutil.move(str(musicxml_path), destination)
    return result_id, destination


def _pick_musicxml_file(output_dir: Path) -> Path | None:
    """Selecciona el primer archivo MusicXML disponible en un directorio."""

    candidates: Iterable[Path] = list(output_dir.rglob("*.musicxml"))
    if not candidates:
        candidates = list(output_dir.rglob("*.xml"))
    if not candidates:
        candidates = list(output_dir.rglob("*.mxl"))
    return next(iter(candidates), None)


def _is_safe_identifier(value: str) -> bool:
    """Valida que el identificador contenga únicamente caracteres seguros."""

    allowed = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_")
    return all(char in allowed for char in value)


def _normalize_cli_arguments(arguments: Iterable[str] | str | None) -> list[str]:
    """Convierte un conjunto de argumentos en una lista segura de cadenas."""

    if arguments is None:
        return []

    if isinstance(arguments, str):
        return [argument for argument in shlex.split(arguments) if argument]

    normalized: list[str] = []
    for argument in arguments:
        text = str(argument).strip()
        if text:
            normalized.append(text)
    return normalized

