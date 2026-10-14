"""Replace only the approved validation page in both existing portfolio PDFs.

Raster uses a CUA capture of the real section. Selectable uses its measured
DOM boxes, shared font sizes, embedded Chinese fonts and local vector icons.
No browser automation is performed by this script.
"""
from pathlib import Path
from io import BytesIO
import hashlib
import html
import json
import re
import shutil
import sys

ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT / "tmp/pdfs/skillcanvas-portfolio"
DATE = "2026-10-14"
if sys.argv[1] == "prepare":
    source = (WORK / f"validation-section-{DATE}.html").read_text()
    css = (ROOT / "app/showcase/showcase.css").read_text()
    source = source.replace("/showcase-icons/eval.png", "assets/eval.png").replace("/icons/tabler/", "assets/")
    css = re.sub(r"(-?\d+(?:\.\d+)?)(d?vw|d?vh)", lambda m: f"{float(m[1]) * (1440 if m[2].endswith('vw') else 1080) / 100}px", css)
    # An isolated export document, not a mutation of the production DOM. Its
    # section retains the site's actual CSS; only page chrome/motion is removed.
    document = f'''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <base href="http://127.0.0.1:3017/"><title>SkillCanvas PDF validation page</title>
    <style>{css}
    html,body{{margin:0;padding:0;width:1440px;background:#f4f0e8}}
    .sc-page{{width:1440px;min-height:0;background:#f4f0e8;padding:24px 0}}
    .sc-validation{{margin-block:0}}
    [data-sc-reveal]{{opacity:1!important;transform:none!important;transition:none!important}}
    .sc-swap{{animation:none!important}}
    </style></head><body><main class="sc-page">{source}</main></body></html>'''
    (ROOT / "output/optimization-loop-demo/pdf-validation.html").write_text(document)
    print("Prepared an isolated document from the real section and shared CSS")
    sys.exit()

sys.path.insert(0, str(ROOT / "tmp/pdfs/pdf-export-deps"))
from reportlab.pdfgen import canvas
from reportlab.lib.colors import Color, HexColor
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph
from reportlab.lib.utils import ImageReader
from reportlab.graphics import renderPDF
from svglib.svglib import svg2rlg
from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject

layout = json.loads((WORK / f"validation-layout-{DATE}.json").read_text())
PAGE_INDEX = 10
WIDTH, HEIGHT = 1080, 810
scale = min((WIDTH - 36) / layout["width"], (HEIGHT - 36) / layout["height"])
left = (WIDTH - layout["width"] * scale) / 2
top = (HEIGHT - layout["height"] * scale) / 2
pdfmetrics.registerFont(TTFont("SC", "/System/Library/Fonts/STHeiti Light.ttc", subfontIndex=1))
pdfmetrics.registerFont(TTFont("SCBold", "/System/Library/Fonts/STHeiti Medium.ttc", subfontIndex=1))
pdfmetrics.registerFontFamily("SC", normal="SC", bold="SCBold", italic="SC", boldItalic="SCBold")

def color(value):
    values = [float(v) for v in re.findall(r"[\d.]+", value)]
    return Color(*(v / 255 for v in values[:3]), alpha=values[3] if len(values) > 3 else 1)

def resource(src):
    return ROOT / "output/optimization-loop-demo" / src if src.startswith("assets/") else ROOT / "public" / src.lstrip("/")

def begin(path):
    c = canvas.Canvas(str(path), pagesize=(WIDTH, HEIGHT), pageCompression=1)
    c.setFillColor(HexColor("#f4f0e8"))
    c.rect(0, 0, WIDTH, HEIGHT, fill=1, stroke=0)
    return c

vector_path = WORK / f"validation-selectable-{DATE}.pdf"
c = begin(vector_path)
c.translate(left, HEIGHT - top)
c.scale(scale, scale)
H = layout["height"]
for box in layout["boxes"]:
    c.setFillColor(color(box["background"]))
    bw = box["borderWidth"]
    c.setLineWidth(bw or 1)
    c.setStrokeColor(color(box["border"]))
    c.roundRect(box["x"], -box["y"] - box["h"], box["w"], box["h"],
                min(box["radius"], box["w"] / 2, box["h"] / 2),
                fill=1, stroke=bool(bw))
for rule in layout["rules"]:
    c.setStrokeColor(color(rule["color"]))
    c.setLineWidth(1)
    c.line(rule["x"], -rule["y"], rule["x"] + rule["w"], -rule["y"])
for image in layout["images"]:
    path = resource(image["src"])
    c.drawImage(ImageReader(str(path)), image["x"], -image["y"] - image["h"], image["w"], image["h"], mask="auto")
for icon in layout["icons"]:
    text = resource(icon["src"]).read_text()
    rgb = color(icon["color"])
    text = text.replace("currentColor", rgb.hexval().replace("0x", "#"))
    drawing = svg2rlg(BytesIO(text.encode()))
    drawing.scale(icon["w"] / drawing.width, icon["h"] / drawing.height)
    renderPDF.draw(drawing, c, icon["x"], -icon["y"] - icon["h"])
for index, block in enumerate(layout["texts"]):
    content = block["html"]
    if "sc-title-line" in content:
        content = "<br/>".join(html.escape(line) for line in block["text"].splitlines())
    else:
        content = re.sub(r"<strong[^>]*>", "<nobr><b>", content).replace("</strong>", "</b></nobr>")
        content = re.sub(r"<(?!/?(?:b|nobr)(?:>|\s))[^>]+>", "", content)
    style = ParagraphStyle(f"web-{index}", fontName="SCBold" if float(block["fontWeight"]) >= 600 else "SC",
                           fontSize=block["fontSize"], leading=block["lineHeight"],
                           textColor=color(block["color"]), wordWrap="CJK", splitLongWords=True,
                           spaceBefore=0, spaceAfter=0)
    p = Paragraph(content, style)
    pad_x = block.get("paddingLeft", 0)
    pad_y = block.get("paddingTop", 0)
    available_width = block["w"] - pad_x - block.get("paddingRight", 0)
    available_height = block["h"] - pad_y - block.get("paddingBottom", 0)
    # Preserve the browser's single-line labels despite small differences
    # between the embedded Chinese font and the platform web font metrics.
    # Fit horizontally, without shrinking the shared font-size hierarchy.
    if available_height <= block["lineHeight"] + 2 and "<b>" not in content:
        text = block["text"]
        measured_width = pdfmetrics.stringWidth(text, style.fontName, style.fontSize)
        c.saveState()
        line = c.beginText(block["x"] + pad_x,
                           -block["y"] - pad_y - (style.leading - style.fontSize) / 2 - style.fontSize * .86)
        line.setFont(style.fontName, style.fontSize)
        line.setFillColor(style.textColor)
        line.setHorizScale(min(100, available_width / measured_width * 100))
        line.textOut(text)
        c.drawText(line)
        c.restoreState()
        continue
    _, ph = p.wrap(available_width, 10000)
    if ph > available_height + 2:
        raise ValueError(f"Text no longer fits its original box: {block['text']}")
    p.drawOn(c, block["x"] + pad_x, -block["y"] - pad_y - ph)
c.showPage()
c.save()

raster_path = WORK / f"validation-screenshot-{DATE}.pdf"
c = begin(raster_path)
c.drawImage(ImageReader(str(WORK / f"validation-web-{DATE}.jpg")), left, top,
            layout["width"] * scale, layout["height"] * scale, mask="auto")
c.showPage()
c.save()

def signature(page):
    return hashlib.sha256(page.get_contents().get_data()).hexdigest(), str(page.mediabox), page.extract_text()

backup = ROOT / f"output/pdf/backups/{DATE}-before-validation-copy-refresh"
backup.mkdir(parents=True, exist_ok=True)
for variant, replacement in [("screenshot", raster_path), ("selectable", vector_path)]:
    output = ROOT / f"output/pdf/SkillCanvas-portfolio-{variant}.pdf"
    saved = backup / output.name
    if not saved.exists():
        shutil.copy2(output, saved)
    old = PdfReader(saved)
    assert len(old.pages) == 13
    original = [signature(page) for page in old.pages]
    writer = PdfWriter(clone_from=old)
    destination = writer.pages[PAGE_INDEX]
    parent = destination["/Parent"]
    destination.clear()
    for key, value in PdfReader(replacement).pages[0].items():
        if key != "/Parent":
            destination[key] = value.clone(writer) if hasattr(value, "clone") else value
    destination[NameObject("/Parent")] = parent
    temporary = output.with_suffix(".updated.pdf")
    writer.write(temporary)
    final = PdfReader(temporary)
    assert len(final.pages) == len(old.pages)
    assert len(final.outline) == len(old.outline)
    for i, page in enumerate(final.pages):
        if i != PAGE_INDEX:
            assert signature(page) == original[i], f"Unrequested change on page {i + 1}"
    if variant == "selectable":
        text = re.sub(r"\s+", "", final.pages[PAGE_INDEX].extract_text())
        for required in ["你的工作规则", "AI真的会遵守吗", "转化率尚未统计", "遗漏待统计指标，弱化了风险", "回归测试确认是否改善"]:
            assert required in text, required
    temporary.replace(output)
    print(json.dumps({"file":str(output),"pages":13,"replaced_page":11,"other_pages_unchanged":12,"bookmarks":len(final.outline)},ensure_ascii=False))
