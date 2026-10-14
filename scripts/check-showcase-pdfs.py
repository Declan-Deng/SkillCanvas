from pathlib import Path
import json
import re
from PIL import Image, ImageDraw, ImageChops, ImageStat
from pypdf import PdfReader

root = Path(__file__).resolve().parent.parent
work = root / "tmp/pdfs/skillcanvas-portfolio"
manifest = json.loads((work / "manifest.json").read_text())
for variant in ["raster", "vector"]:
    for group in range(4):
        sheet = Image.new("RGB", (1080, 858), "#e7e7e7")
        draw = ImageDraw.Draw(sheet)
        for slot in range(4):
            number = group * 4 + slot + 1
            if number > 13:
                break
            file = work / f"{variant}-{number:02d}.png"
            image = Image.open(file).convert("RGB")
            image.thumbnail((530, 398), Image.Resampling.LANCZOS)
            x, y = (slot % 2) * 540 + 5, (slot // 2) * 429 + 25
            sheet.paste(image, (x, y))
            draw.text((x + 5, y - 20), f"{variant} / {number:02d}", fill="black")
        sheet.save(work / f"{variant}-review-{group + 1}.png")

errors = []
for index in range(1, 14):
    raster = Image.open(work / f"raster-{index:02d}.png").convert("RGB")
    vector = Image.open(work / f"vector-{index:02d}.png").convert("RGB")
    errors.append(round(sum(ImageStat.Stat(ImageChops.difference(raster, vector)).mean) / 3, 2))
    assert ImageStat.Stat(vector).stddev[0] > 15, f"Blank page {index}"

for variant in ["screenshot", "selectable"]:
    reader = PdfReader(root / f"output/pdf/SkillCanvas-portfolio-{variant}.pdf")
    assert len(reader.pages) == 13
    assert len(reader.outline) == 13
    for page in reader.pages:
        assert page.mediabox.width > page.mediabox.height
        for annotation in page.get("/Annots", []):
            action = annotation.get_object().get("/A", {})
            uri = action.get("/URI", "")
            assert "localhost" not in uri and "127.0.0.1" not in uri
    if variant == "selectable":
        text = re.sub(r"\s+", "", "\n".join(page.extract_text() for page in reader.pages))
        for required in ["把你的工作方法", "规则检查", "团队基金周报", "我的基金观察周报", "AI真的会遵守吗"]:
            assert required in text, required
print(json.dumps({"pages_each": 13, "mean_pixel_difference_0_to_255": errors, "checks": "landscape, content, links, bookmarks, blank-page detection passed"}))
