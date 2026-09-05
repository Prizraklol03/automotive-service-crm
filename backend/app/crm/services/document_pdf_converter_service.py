from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

from app.core.config import get_settings
from app.core.errors import AppError
from app.core.logging import get_logger
from app.crm.services.document_mapping_service import TemplateRenderBundle


logger = get_logger(__name__)


@dataclass(slots=True)
class PdfConversionResult:
    engine: str
    note: str | None = None


class DocumentPdfConverterService:
    def __init__(self) -> None:
        self.settings = get_settings()

    def convert(self, docx_path: Path, pdf_path: Path, bundle: TemplateRenderBundle) -> PdfConversionResult:
        if self._try_libreoffice(docx_path, pdf_path):
            logger.info("PDF generated with LibreOffice for %s", docx_path)
            return PdfConversionResult(engine="libreoffice")

        raise AppError(
            code="pdf_conversion_failed",
            message="Не удалось сгенерировать PDF через LibreOffice. Проверьте, что LibreOffice установлен и доступен.",
            status_code=500,
        )

    def _try_libreoffice(self, docx_path: Path, pdf_path: Path) -> bool:
        executable = self.settings.libreoffice_executable_path or shutil.which("soffice") or shutil.which("libreoffice")
        if not executable:
            return False

        output_dir = pdf_path.parent
        output_dir.mkdir(parents=True, exist_ok=True)
        result = subprocess.run(
            [
                executable,
                "--headless",
                "--convert-to",
                "pdf",
                "--outdir",
                str(output_dir),
                str(docx_path),
            ],
            capture_output=True,
            text=True,
            errors="replace",
            timeout=120,
            check=False,
        )
        generated_pdf = output_dir / f"{docx_path.stem}.pdf"
        if result.returncode != 0 or not generated_pdf.exists():
            logger.warning("LibreOffice conversion failed for %s: %s", docx_path, result.stderr.strip())
            return False

        if generated_pdf.resolve() != pdf_path.resolve():
            generated_pdf.replace(pdf_path)
        return pdf_path.exists()
