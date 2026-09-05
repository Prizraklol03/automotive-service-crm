from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from app.crm.models.inspection import InspectionGeometryType, InspectionSeverity, InspectionViewType


class InspectionCanvasRendererService:
    CANVAS_SIZE = (1400, 900)
    PADDING = 80
    BASE_FILL = "#f8fafc"
    FRAME_COLOR = "#cbd5e1"
    SILHOUETTE_COLOR = "#94a3b8"
    TEXT_COLOR = "#0f172a"
    MARK_COLORS = {
        InspectionSeverity.LOW: "#f59e0b",
        InspectionSeverity.MEDIUM: "#3b82f6",
        InspectionSeverity.HIGH: "#ef4444",
    }
    VIEW_TITLES = {
        InspectionViewType.FRONT: "Вид спереди",
        InspectionViewType.REAR: "Вид сзади",
        InspectionViewType.LEFT: "Левый борт",
        InspectionViewType.RIGHT: "Правый борт",
        InspectionViewType.TOP: "Вид сверху",
        InspectionViewType.INTERIOR: "Салон",
    }

    def __init__(self) -> None:
        self.font = ImageFont.load_default()

    def render_view(self, view_type: InspectionViewType, marks: list[dict], output_path: Path) -> Path:
        image = Image.new("RGB", self.CANVAS_SIZE, self.BASE_FILL)
        draw = ImageDraw.Draw(image, "RGBA")
        self._draw_background(draw, view_type)
        self._draw_marks(draw, marks)
        image.save(output_path, "PNG")
        return output_path

    def _draw_background(self, draw: ImageDraw.ImageDraw, view_type: InspectionViewType) -> None:
        width, height = self.CANVAS_SIZE
        draw.rounded_rectangle((24, 24, width - 24, height - 24), radius=36, outline=self.FRAME_COLOR, width=4)
        try:
            draw.text((44, 42), self.VIEW_TITLES[view_type], fill=self.TEXT_COLOR, font=self.font)
        except UnicodeEncodeError:
            draw.text((44, 42), view_type.value.upper(), fill=self.TEXT_COLOR, font=self.font)

        left = self.PADDING
        top = 140
        right = width - self.PADDING
        bottom = height - 120

        if view_type in {InspectionViewType.FRONT, InspectionViewType.REAR}:
            draw.rounded_rectangle((left + 260, top, right - 260, bottom), radius=120, outline=self.SILHOUETTE_COLOR, width=8)
            draw.rounded_rectangle((left + 360, top + 120, right - 360, bottom - 120), radius=60, outline=self.SILHOUETTE_COLOR, width=4)
            draw.ellipse((left + 220, bottom - 200, left + 360, bottom - 60), outline=self.SILHOUETTE_COLOR, width=8)
            draw.ellipse((right - 360, bottom - 200, right - 220, bottom - 60), outline=self.SILHOUETTE_COLOR, width=8)
            draw.line((left + 300, top + 160, right - 300, top + 160), fill=self.SILHOUETTE_COLOR, width=4)
        elif view_type in {InspectionViewType.LEFT, InspectionViewType.RIGHT}:
            draw.rounded_rectangle((left + 100, top + 160, right - 100, bottom - 120), radius=90, outline=self.SILHOUETTE_COLOR, width=8)
            draw.polygon(
                [
                    (left + 260, top + 160),
                    (left + 420, top + 40),
                    (right - 420, top + 40),
                    (right - 280, top + 160),
                ],
                outline=self.SILHOUETTE_COLOR,
                width=8,
            )
            draw.ellipse((left + 230, bottom - 150, left + 390, bottom + 10), outline=self.SILHOUETTE_COLOR, width=8)
            draw.ellipse((right - 390, bottom - 150, right - 230, bottom + 10), outline=self.SILHOUETTE_COLOR, width=8)
            draw.line((left + 320, top + 210, right - 320, top + 210), fill=self.SILHOUETTE_COLOR, width=4)
        elif view_type == InspectionViewType.TOP:
            draw.rounded_rectangle((left + 180, top, right - 180, bottom), radius=160, outline=self.SILHOUETTE_COLOR, width=8)
            draw.rounded_rectangle((left + 320, top + 110, right - 320, bottom - 110), radius=90, outline=self.SILHOUETTE_COLOR, width=5)
            draw.line((width // 2, top + 24, width // 2, bottom - 24), fill=self.SILHOUETTE_COLOR, width=4)
        else:
            draw.rounded_rectangle((left + 160, top + 40, right - 160, bottom), radius=56, outline=self.SILHOUETTE_COLOR, width=8)
            draw.rounded_rectangle((left + 240, top + 120, right - 240, top + 250), radius=32, outline=self.SILHOUETTE_COLOR, width=5)
            draw.line((left + 280, top + 320, right - 280, top + 320), fill=self.SILHOUETTE_COLOR, width=4)
            draw.line((width // 2, top + 320, width // 2, bottom - 60), fill=self.SILHOUETTE_COLOR, width=4)

    def _draw_marks(self, draw: ImageDraw.ImageDraw, marks: list[dict]) -> None:
        for index, mark in enumerate(marks, start=1):
            points = [self._to_pixels(point["x"], point["y"]) for point in mark["geometry_data"]["points"]]
            color = self.MARK_COLORS.get(mark["severity"], "#3b82f6")

            if mark["geometry_type"] == InspectionGeometryType.POINT.value:
                x, y = points[0]
                draw.ellipse((x - 14, y - 14, x + 14, y + 14), fill=color, outline="#ffffff", width=3)
                label_anchor = (x + 20, y - 22)
            elif mark["geometry_type"] == InspectionGeometryType.LINE.value:
                draw.line(points, fill=color, width=8, joint="curve")
                x, y = points[-1]
                label_anchor = (x + 18, y - 18)
            else:
                draw.polygon(points, fill=self._hex_to_rgba(color, 52), outline=color, width=6)
                x, y = points[0]
                label_anchor = (x + 18, y - 18)

            lx, ly = label_anchor
            draw.rounded_rectangle((lx - 4, ly - 4, lx + 26, ly + 18), radius=10, fill="#0f172a")
            draw.text((lx + 4, ly), str(index), fill="#ffffff", font=self.font)

    def _to_pixels(self, normalized_x: float, normalized_y: float) -> tuple[int, int]:
        width, height = self.CANVAS_SIZE
        usable_width = width - self.PADDING * 2
        usable_height = height - 220
        x = int(self.PADDING + normalized_x * usable_width)
        y = int(140 + normalized_y * usable_height)
        return x, y

    @staticmethod
    def _hex_to_rgba(value: str, alpha: int) -> tuple[int, int, int, int]:
        value = value.lstrip("#")
        if len(value) != 6:
            return (59, 130, 246, alpha)
        return (int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16), alpha)
