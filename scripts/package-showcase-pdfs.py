from pathlib import Path
import json
import re
import unicodedata
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from pypdf import PdfReader, PdfWriter, Transformation
from pypdf.generic import DecodedStreamObject, NameObject

root = Path(__file__).resolve().parent.parent
work = root / "tmp/pdfs/skillcanvas-portfolio"
output = root / "output/pdf"
manifest = json.loads((work / "manifest.json").read_text())
factor = 0.75  # CSS pixels to PDF points, identical to Chromium's print sizing.
width, height = manifest["width"] * factor, manifest["height"] * factor

def normalize_cjk_maps(writer):
    # macOS font subsets can map the same glyph to a Kangxi radical rather than
    # its ordinary Chinese character. Correct copying/searching, not appearance.
    def canonical(value):
        text = bytes.fromhex(value).decode("utf-16-be")
        text = "".join(unicodedata.normalize("NFKC", char) if 0x2E80 <= ord(char) <= 0x2FFF or 0xF900 <= ord(char) <= 0xFAFF else char for char in text)
        return text.encode("utf-16-be").hex().upper()

    for obj in list(writer._objects):
        if not isinstance(obj, dict) or obj.get("/Type") != "/Font" or "/ToUnicode" not in obj:
            continue
        source = obj["/ToUnicode"].get_object().get_data().decode("ascii")
        def chars(match):
            body = re.sub(r"<([0-9A-Fa-f]+)>\s+<([0-9A-Fa-f]+)>", lambda row: f"<{row[1]}> <{canonical(row[2])}>", match[2])
            return f"{match[1]} beginbfchar\n{body}endbfchar"
        fixed = re.sub(r"(\d+) beginbfchar\s*\n(.*?)endbfchar", chars, source, flags=re.S)
        def ranges(match):
            rows = re.findall(r"<([0-9A-Fa-f]+)>\s+<([0-9A-Fa-f]+)>\s+<([0-9A-Fa-f]+)>", match[2])
            if not rows or len(rows) != int(match[1]):
                return match[0]
            if not any(canonical(dest) != dest.upper() for _, _, dest in rows):
                return match[0]
            entries = []
            for start, end, dest in rows:
                for offset, code in enumerate(range(int(start, 16), int(end, 16) + 1)):
                    entries.append(f"<{code:0{len(start)}X}> <{canonical(f'{int(dest, 16) + offset:0{len(dest)}X}')}>\n")
            return f"{len(entries)} beginbfchar\n{''.join(entries)}endbfchar"
        fixed = re.sub(r"(\d+) beginbfrange\s*\n(.*?)endbfrange", ranges, fixed, flags=re.S)
        if fixed != source:
            stream = DecodedStreamObject()
            stream.set_data(fixed.encode("ascii"))
            obj[NameObject("/ToUnicode")] = writer._add_object(stream)

raster_raw = work / "screenshot-raw.pdf"
c = canvas.Canvas(str(raster_raw), pagesize=(width, height), pageCompression=1)
for item in manifest["snapshots"]:
    s, x, y = item["fit"]["scale"], item["fit"]["x"], item["fit"]["y"]
    c.setFillColorRGB(244/255, 240/255, 232/255)
    c.rect(0, 0, width, height, fill=1, stroke=0)
    image_h = item["height"] * s * factor
    c.drawImage(ImageReader(str(work / item["filename"])), x * factor, height - y * factor - image_h,
                width=manifest["width"] * s * factor, height=image_h, mask="auto")
    for link in item["links"]:
        left = (x + link["x"] * s) * factor
        top = (y + (link["y"] - item["y"]) * s) * factor
        c.linkURL(link["href"], (left, height - top - link["height"] * s * factor,
                  left + link["width"] * s * factor, height - top), relative=0, thickness=0)
    c.showPage()
c.save()

native_writer = PdfWriter()
for item in manifest["snapshots"]:
    source = PdfReader(work / item["nativeFile"])
    assert len(source.pages) == 1, item["nativeFile"]
    page = native_writer.add_blank_page(width, height)
    background = DecodedStreamObject()
    background.set_data(f"{244/255:.6f} {240/255:.6f} {232/255:.6f} rg 0 0 {width} {height} re f\n".encode("ascii"))
    page[NameObject("/Contents")] = native_writer._add_object(background)
    source_page = source.pages[0]
    source_page.pop(NameObject("/Annots"), None)
    s = min((width - 36) / float(source_page.mediabox.width), (height - 36) / float(source_page.mediabox.height))
    x = (width - float(source_page.mediabox.width) * s) / 2
    bottom = (height - float(source_page.mediabox.height) * s) / 2
    page.merge_transformed_page(source_page, Transformation().scale(s).translate(x, bottom))
    top = height - bottom - float(source_page.mediabox.height) * s
    for link in item["links"]:
        from pypdf.annotations import Link
        left = x + link["x"] * s * factor
        ytop = top + (link["y"] - item["y"]) * s * factor
        native_writer.add_annotation(len(native_writer.pages) - 1, Link(rect=(left, height - ytop - link["height"] * s * factor,
                  left + link["width"] * s * factor, height - ytop), url=link["href"]))
native_raw = work / "selectable-raw.pdf"
with native_raw.open("wb") as stream:
    native_writer.write(stream)

for source, name, variant in [(raster_raw, "SkillCanvas-portfolio-screenshot.pdf", "High-resolution web snapshots"),
                              (native_raw, "SkillCanvas-portfolio-selectable.pdf", "Selectable original web layout")]:
    reader = PdfReader(source)
    if len(reader.pages) != len(manifest["snapshots"]):
        raise ValueError(f"{name}: expected {len(manifest['snapshots'])} pages, got {len(reader.pages)}")
    writer = PdfWriter()
    writer.append(reader)
    if "selectable" in name:
        normalize_cjk_maps(writer)
    writer.add_metadata({"/Title": "SkillCanvas | Portfolio", "/Subject": variant, "/Author": "Declan Deng", "/Creator": "SkillCanvas portfolio export"})
    for index, item in enumerate(manifest["snapshots"]):
        writer.add_outline_item(item["label"], index)
    writer.compress_identical_objects()
    with (output / name).open("wb") as stream:
        writer.write(stream)
    final = PdfReader(output / name)
    texts = sum(len(page.extract_text() or "") for page in final.pages)
    links = sum(len(page.get("/Annots", [])) for page in final.pages)
    if "selectable" in name:
        assert all(len(page.extract_text() or "") > 100 for page in final.pages), "Missing visible text on a page"
        assert "把你的工作方法" in final.pages[0].extract_text()
    print(json.dumps({"file": str(output / name), "pages": len(reader.pages), "text_characters": texts, "links": links, "bytes": (output / name).stat().st_size}))
