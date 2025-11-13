"""Servicios para ejecutar el motor OMR y gestionar resultados MusicXML."""

from __future__ import annotations

import logging
import shutil
import subprocess
import tempfile
import textwrap
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Tuple

from app.core import settings

logger = logging.getLogger(__name__)


class OMRProcessingError(RuntimeError):
    """Excepción base para errores durante el procesamiento OMR."""


@dataclass(slots=True)
class OMRResult:
    """Representa el resultado exitoso de un procesamiento OMR."""

    result_id: str
    musicxml_path: Path


def run_omr(input_path: Path) -> OMRResult:
    """Ejecuta el flujo de OMR y devuelve un resultado listo para descargar.

    El procesamiento intentará utilizar Audiveris si se ha configurado un comando
    válido. En caso contrario, o si se produce un error y ``enable_stub_omr`` es
    ``True``, se generará un archivo MusicXML ficticio para mantener operativo el
    flujo de extremo a extremo.
    """

    if not input_path.exists():
        raise OMRProcessingError(
            f"El archivo de entrada '{input_path}' no existe o fue eliminado antes de ejecutar OMR."
        )

    try:
        if settings.audiveris_command:
            musicxml_path = _run_with_audiveris(input_path)
        else:
            raise OMRProcessingError(
                "No se configuró el comando de Audiveris. Se utilizará un resultado ficticio."
            )
    except OMRProcessingError as exc:
        if not settings.enable_stub_omr:
            raise
        logger.warning("Fallo al ejecutar Audiveris: %s", exc)
        musicxml_path = _generate_stub_result(input_path)

    result_id, stored_path = _store_musicxml_result(musicxml_path)
    return OMRResult(result_id=result_id, musicxml_path=stored_path)


def resolve_musicxml_path(result_id: str) -> Path:
    """Devuelve la ruta del archivo MusicXML asociado a ``result_id``."""

    if not result_id or not _is_safe_identifier(result_id):
        raise FileNotFoundError(result_id)

    target_path = settings.results_dir / f"{result_id}.musicxml"
    if not target_path.exists():
        raise FileNotFoundError(result_id)
    return target_path


def _run_with_audiveris(input_path: Path) -> Path:
    """Invoca Audiveris mediante CLI y devuelve la ruta temporal del MusicXML."""

    output_dir = Path(tempfile.mkdtemp(prefix="omr_audiveris_"))
    command = [
        *settings.audiveris_command,
        "-batch",
        "-export",
        "-output",
        str(output_dir),
        str(input_path),
    ]

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



def _generate_stub_result(input_path: Path) -> Path:
    """Genera un archivo MusicXML mínimo para mantener el flujo funcional."""

    stub_content = textwrap.dedent(
        f"""
            <?xml version="1.0" encoding="UTF-8"?>
            <!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN"
              "http://www.musicxml.org/dtds/partwise.dtd">
            <score-partwise version="4.0">
              <work>
                <work-title>Resultado ficticio para {input_path.name}</work-title>
              </work>
              <identification>
                <creator type="software">Music Scanner (modo demostración)</creator>
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




def _store_musicxml_result(musicxml_path: Path) -> Tuple[str, Path]:
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

