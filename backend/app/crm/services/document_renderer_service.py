from __future__ import annotations

from copy import deepcopy
from io import BytesIO
from pathlib import Path
import re
import zipfile
from xml.etree import ElementTree as ET

from app.core.errors import AppError
from app.crm.models.document import CrmDocument
from app.crm.services.document_mapping_service import DocumentMappingService, TemplateRenderBundle


class DocumentRendererService:
    NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    W_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    MARKUP_COMPATIBILITY_NS = "http://schemas.openxmlformats.org/markup-compatibility/2006"
    PLACEHOLDER_RE = re.compile(r"\{\{(.*?)\}\}", re.S)
    SECTION_RE = re.compile(r"\{\{#([^{}]+)\}\}(.*?)\{\{/([^{}]+)\}\}", re.S)
    SECTION_OPEN_RE = re.compile(r"^\s*\{\{#([^{}]+)\}\}\s*$")
    SECTION_CLOSE_RE = re.compile(r"^\s*\{\{/([^{}]+)\}\}\s*$")
    ROOT_TAG_RE = re.compile(r"<(?P<tag>[\w:.-]+)(?P<attrs>[^>]*)>", re.S)
    XMLNS_ATTR_RE = re.compile(r'\s+xmlns(?::(?P<prefix>[\w.-]+))?="(?P<uri>[^"]+)"')
    MISSING_PREFIX_RE = re.compile(r"\b([\w.-]+)\b")
    FALLBACK_NAMESPACES = {
        "mc": "http://schemas.openxmlformats.org/markup-compatibility/2006",
        "w14": "http://schemas.microsoft.com/office/word/2010/wordml",
        "w15": "http://schemas.microsoft.com/office/word/2012/wordml",
        "w16cid": "http://schemas.microsoft.com/office/word/2016/wordml/cid",
        "w16": "http://schemas.microsoft.com/office/word/2018/wordml",
        "wp14": "http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing",
        "wps": "http://schemas.microsoft.com/office/word/2010/wordprocessingShape",
        "wpg": "http://schemas.microsoft.com/office/word/2010/wordprocessingGroup",
        "wpi": "http://schemas.microsoft.com/office/word/2010/wordprocessingInk",
        "wne": "http://schemas.microsoft.com/office/word/2006/wordml",
    }

    def __init__(self) -> None:
        self.mapping = DocumentMappingService()

    def build_render_bundle(self, document: CrmDocument, template_path: Path) -> TemplateRenderBundle:
        with zipfile.ZipFile(template_path) as archive:
            text_chunks: list[str] = []
            for name in archive.namelist():
                if not self._is_renderable_word_xml(name):
                    continue
                xml_text = archive.read(name).decode("utf-8")
                root = ET.fromstring(xml_text)
                text_chunks.append("".join(node.text or "" for node in root.findall(".//w:t", self.NS)))
        text_stream = "".join(text_chunks)
        placeholders = self.mapping.extract_placeholders(text_stream)
        return self.mapping.build_bundle(document, placeholders)

    def render_docx_bytes(self, template_path: Path, bundle: TemplateRenderBundle) -> bytes:
        if bundle.unresolved_placeholders:
            raise AppError(
                code="validation_error",
                message=f"Unsupported placeholders: {', '.join(bundle.unresolved_placeholders)}",
                status_code=422,
            )

        buffer = BytesIO()
        with zipfile.ZipFile(template_path) as source, zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as target:
            for item in source.infolist():
                content = source.read(item.filename)
                if self._is_renderable_word_xml(item.filename):
                    content = self._render_document_xml(content.decode("utf-8"), bundle).encode("utf-8")
                target.writestr(item, content)
        return buffer.getvalue()

    def write_docx(self, path: Path, template_path: Path, bundle: TemplateRenderBundle) -> None:
        path.write_bytes(self.render_docx_bytes(template_path, bundle))

    def _render_document_xml(self, xml_text: str, bundle: TemplateRenderBundle) -> str:
        root = ET.fromstring(xml_text)
        self._expand_table_rows(root, bundle)
        self._apply_table_row_sections(root, bundle)
        self._apply_paragraph_sections(root, bundle)
        for paragraph in root.findall(".//w:p", self.NS):
            self._replace_placeholders_in_text_container(paragraph, bundle.common_replacements, bundle)
        namespaces = self._collect_required_namespaces(xml_text, root)
        self._register_namespaces(namespaces)
        rendered_xml = ET.tostring(root, encoding="unicode", xml_declaration=False)
        return self._inject_root_namespaces(rendered_xml, namespaces)

    def _expand_table_rows(self, root: ET.Element, bundle: TemplateRenderBundle) -> None:
        for table in root.findall(".//w:tbl", self.NS):
            for row in list(table.findall("./w:tr", self.NS)):
                row_placeholders = set(self.mapping.extract_placeholders(self._row_text(row)))
                if "srv.name" in row_placeholders:
                    self._replace_row_with_items(table, row, bundle.service_rows, bundle)

    def _replace_row_with_items(
        self,
        table: ET.Element,
        template_row: ET.Element,
        items: list[dict[str, str]],
        bundle: TemplateRenderBundle,
    ) -> None:
        rows = list(table)
        index = rows.index(template_row)
        table.remove(template_row)
        for offset, item in enumerate(items):
            cloned_row = deepcopy(template_row)
            replacements = {**bundle.common_replacements, **item}
            for paragraph in cloned_row.findall(".//w:p", self.NS):
                self._replace_placeholders_in_text_container(paragraph, replacements, bundle)
            table.insert(index + offset, cloned_row)

    def _apply_table_row_sections(self, root: ET.Element, bundle: TemplateRenderBundle) -> None:
        for table in root.findall(".//w:tbl", self.NS):
            inactive_stack: list[bool] = []
            for row in list(table.findall("./w:tr", self.NS)):
                row_text = self._row_text(row).strip()
                open_match = self.SECTION_OPEN_RE.fullmatch(row_text)
                close_match = self.SECTION_CLOSE_RE.fullmatch(row_text)
                if open_match:
                    inactive_stack.append(self._section_enabled(open_match.group(1), bundle))
                    table.remove(row)
                    continue
                if close_match:
                    if inactive_stack:
                        inactive_stack.pop()
                    table.remove(row)
                    continue
                if inactive_stack and not all(inactive_stack):
                    table.remove(row)

    def _apply_paragraph_sections(self, root: ET.Element, bundle: TemplateRenderBundle) -> None:
        parent_map = {child: parent for parent in root.iter() for child in list(parent)}
        inactive_stack: list[bool] = []
        paragraphs = list(root.findall(".//w:p", self.NS))
        for paragraph in paragraphs:
            text = self._paragraph_text(paragraph).strip()
            open_match = self.SECTION_OPEN_RE.fullmatch(text)
            close_match = self.SECTION_CLOSE_RE.fullmatch(text)
            parent = parent_map.get(paragraph)
            if parent is not None and parent.tag == f"{self.W_NS}tc":
                continue
            if open_match:
                inactive_stack.append(self._section_enabled(open_match.group(1), bundle))
                self._remove_node(paragraph, parent_map)
                continue
            if close_match:
                if inactive_stack:
                    inactive_stack.pop()
                self._remove_node(paragraph, parent_map)
                continue
            if inactive_stack and not all(inactive_stack):
                self._remove_node(paragraph, parent_map)

    def _replace_placeholders_in_text_container(
        self,
        container: ET.Element,
        replacements: dict[str, str],
        bundle: TemplateRenderBundle,
    ) -> None:
        text_nodes = container.findall(".//w:t", self.NS)
        if not text_nodes:
            return
        combined = "".join(node.text or "" for node in text_nodes)
        if "{{" not in combined:
            return

        rendered = self._render_inline_sections(combined, bundle)

        def replace_match(match: re.Match[str]) -> str:
            normalized = self.mapping.normalize_placeholder_name(match.group(1))
            if normalized.startswith("#") or normalized.startswith("/"):
                return ""
            return replacements.get(normalized, "")

        replaced = self.PLACEHOLDER_RE.sub(replace_match, rendered)
        text_nodes[0].text = replaced
        for node in text_nodes[1:]:
            node.text = ""

    def _render_inline_sections(self, text: str, bundle: TemplateRenderBundle) -> str:
        previous = None
        rendered = text
        while previous != rendered:
            previous = rendered

            def replace_section(match: re.Match[str]) -> str:
                start_name = self.mapping.normalize_placeholder_name(match.group(1))
                end_name = self.mapping.normalize_placeholder_name(match.group(3))
                if start_name != end_name:
                    return ""
                return match.group(2) if self._section_enabled(start_name, bundle) else ""

            rendered = self.SECTION_RE.sub(replace_section, rendered)
        return rendered

    def _section_enabled(self, section_name: str, bundle: TemplateRenderBundle) -> bool:
        normalized = self.mapping.normalize_placeholder_name(section_name)
        return bundle.section_flags.get(normalized, False)

    @staticmethod
    def _remove_node(node: ET.Element, parent_map: dict[ET.Element, ET.Element]) -> None:
        parent = parent_map.get(node)
        if parent is not None:
            parent.remove(node)

    def _paragraph_text(self, paragraph: ET.Element) -> str:
        return "".join(node.text or "" for node in paragraph.findall(".//w:t", self.NS))

    def _row_text(self, row: ET.Element) -> str:
        return "".join(node.text or "" for node in row.findall(".//w:t", self.NS))

    def _is_renderable_word_xml(self, filename: str) -> bool:
        if filename == "word/document.xml":
            return True
        if filename.startswith("word/header") and filename.endswith(".xml"):
            return True
        if filename.startswith("word/footer") and filename.endswith(".xml"):
            return True
        return False

    def _collect_required_namespaces(self, xml_text: str, root: ET.Element) -> dict[str, str]:
        namespaces = self._extract_declared_namespaces(xml_text)
        namespaces.setdefault("w", self.NS["w"])
        namespaces.setdefault("mc", self.MARKUP_COMPATIBILITY_NS)

        compat_attr_name = f"{{{self.MARKUP_COMPATIBILITY_NS}}}Ignorable"
        for compat_value in root.attrib.get(compat_attr_name, "").split():
            self._add_fallback_namespace(namespaces, compat_value)

        for choice in root.findall(f".//{{{self.MARKUP_COMPATIBILITY_NS}}}Choice"):
            for required_prefix in self.MISSING_PREFIX_RE.findall(choice.attrib.get("Requires", "")):
                self._add_fallback_namespace(namespaces, required_prefix)

        return namespaces

    def _extract_declared_namespaces(self, xml_text: str) -> dict[str, str]:
        root_match = self.ROOT_TAG_RE.search(xml_text)
        if not root_match:
            return {}
        namespaces: dict[str, str] = {}
        for match in self.XMLNS_ATTR_RE.finditer(root_match.group("attrs")):
            prefix = match.group("prefix") or ""
            namespaces[prefix] = match.group("uri")
        return namespaces

    def _add_fallback_namespace(self, namespaces: dict[str, str], prefix: str) -> None:
        if prefix in namespaces:
            return
        fallback_uri = self.FALLBACK_NAMESPACES.get(prefix)
        if fallback_uri:
            namespaces[prefix] = fallback_uri

    def _register_namespaces(self, namespaces: dict[str, str]) -> None:
        for prefix, uri in namespaces.items():
            ET.register_namespace(prefix, uri)

    def _inject_root_namespaces(self, xml_text: str, namespaces: dict[str, str]) -> str:
        root_match = self.ROOT_TAG_RE.search(xml_text)
        if not root_match:
            return xml_text

        attrs = root_match.group("attrs")
        missing_declarations: list[str] = []
        for prefix, uri in namespaces.items():
            declaration = f'xmlns:{prefix}="{uri}"' if prefix else f'xmlns="{uri}"'
            if declaration not in attrs:
                missing_declarations.append(declaration)

        if not missing_declarations:
            return xml_text

        insertion = " " + " ".join(missing_declarations)
        _, end = root_match.span("attrs")
        return f"{xml_text[:end]}{insertion}{xml_text[end:]}"
