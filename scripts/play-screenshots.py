"""Google Play screenshots from raw Android captures, in the App Store set's style.

    python scripts/play-screenshots.py --lang ar --dir "path\\to\\captures"

Reads <lang>-map.png, <lang>-detail.png, <lang>-add.png and <lang>-district.png
(raw emulator/phone captures) and writes <dir>/out/play-<lang>-01.png ... -05.png
at 1080x1920, plus play-feature-graphic.png (1024x500) and play-icon.png (512x512).

Why this isn't aso-panels.py with a new CANVAS:
- Play rejects any screenshot whose long side is more than twice the short
  one. The App Store set is 1320x2868 (2.17:1), so none of it uploads. 9:16
  is also the ratio Play asks for before it will feature an app.
- The App Store set shows an iPhone, iOS and Apple Maps. Android users get
  MapLibre/MapTiler, so the Play set has to be real Android captures in an
  Android-shaped frame (punch-hole camera, no Dynamic Island).
- Each panel is laid out as HTML and rendered by headless Edge, because
  Pillow here has no libraqm: Arabic comes out unjoined, and fonts without
  Unicode presentation forms draw as empty boxes. The browser shapes Arabic
  properly and can use any Google Font.

Same rule as the other generators: the capture's own pixels are placed, never
regenerated, so the store never shows UI the app doesn't have.

Fonts: Poppins for English, matching the App Store set. The App Store
Arabic headlines were set in Apple's rounded Arabic system font, which isn't
available on Windows; Baloo Bhaijaan 2 is the closest rounded match.
"""

import argparse
import os
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

from PIL import Image

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
W, H = 1080, 1920

BLUE = "#0967FF"

COPY = {
    "ar": {
        "hero": ["إيجار،", "شراء،", "بيع"],
        "detail": "اتصل بالمالك مباشرة",
        "add": "أضف عقارك مجاناً",
        "district": "ابحث حسب المنطقة",
        "feature": "عقارات للبيع والإيجار في ليبيا",
    },
    "en": {
        "hero": ["Buy,", "Rent,", "Sell"],
        "detail": "Call the owner directly",
        "add": "List your property for free",
        "district": "Search by district",
        "feature": "Property for sale and rent in Libya",
    },
}

# Downloaded once into a local cache and loaded by file URL: a Google Fonts
# <link> doesn't reliably finish inside headless Edge's render budget, and a
# panel captured before it lands silently falls back to a system font.
FONT_FILES = {
    "Poppins": "ofl/poppins/Poppins-Regular.ttf",
    "Baloo Bhaijaan 2": "ofl/baloobhaijaan2/BalooBhaijaan2%5Bwght%5D.ttf",
}
FONT_CACHE = Path(os.environ.get("LOCALAPPDATA", tempfile.gettempdir())) / "aqari-store-fonts"


def font_faces():
    FONT_CACHE.mkdir(parents=True, exist_ok=True)
    rules = []
    for family, repo_path in FONT_FILES.items():
        local = FONT_CACHE / repo_path.rsplit("/", 1)[1].replace("%5B", "[").replace("%5D", "]")
        if not local.exists():
            url = f"https://github.com/google/fonts/raw/main/{repo_path}"
            urllib.request.urlretrieve(url, local)
        rules.append(f"@font-face{{font-family:'{family}';src:url('{local.as_uri()}')}}")
    return "".join(rules)


def uri(path):
    return Path(path).resolve().as_uri()


def gradient(angle):
    # Sampled from the App Store panels: saturated brand blue in one corner,
    # through a soft periwinkle, to near-white in the opposite one.
    return f"linear-gradient({angle}, {BLUE} 0%, #3F87FF 30%, #97BCFA 62%, #D6E4FF 84%, #FAFBFF 100%)"


def phone(capture, width, css=""):
    """An Android-shaped device around a capture: thin even bezel, rounded
    corners, a centred punch-hole camera and two side buttons."""
    bezel = round(width * 0.026)
    radius = round(width * 0.11)
    screen_w = width - bezel * 2
    return f"""
    <div class="phone" style="width:{width}px;border-radius:{radius}px;padding:{bezel}px;{css}">
      <i class="btn" style="top:{round(width*0.42)}px;height:{round(width*0.2)}px"></i>
      <i class="btn" style="top:{round(width*0.7)}px;height:{round(width*0.12)}px"></i>
      <img src="{uri(capture)}" style="width:{screen_w}px;border-radius:{radius - bezel}px">
      <b class="cam" style="top:{bezel + round(width*0.028)}px;width:{round(width*0.034)}px;height:{round(width*0.034)}px"></b>
    </div>"""


def page(body, width, height, lang, background):
    font = "'Baloo Bhaijaan 2'" if lang == "ar" else "'Poppins'"
    return f"""<!doctype html><html lang="{lang}" dir="{'rtl' if lang == 'ar' else 'ltr'}"><head>
<meta charset="utf-8"><style>{font_faces()}
  html,body{{margin:0;width:{width}px;height:{height}px;overflow:hidden}}
  body{{background:{background};position:relative;font-family:{font},sans-serif;color:#fff}}
  .h{{position:absolute;left:0;right:0;text-align:center;font-weight:400;line-height:1.08;letter-spacing:-0.5px}}
  .phone{{position:absolute;background:#111215;box-shadow:0 40px 90px rgba(8,20,48,.38);box-sizing:border-box}}
  .phone img{{display:block}}
  .phone .cam{{position:absolute;left:50%;transform:translateX(-50%);background:#0b0b0d;border-radius:50%;
               box-shadow:inset 0 0 0 3px #1c1d22}}
  .phone .btn{{position:absolute;right:-6px;width:6px;background:#1a1b1f;border-radius:0 4px 4px 0}}
</style></head><body>{body}</body></html>"""


def render(html, width, height, out_path):
    # Not a TemporaryDirectory: msedge.exe on Windows returns before its
    # renderer has finished, and still holds the profile folder open, so the
    # context manager's cleanup fails. The budget gives Google Fonts time to
    # load before the capture.
    tmp = tempfile.mkdtemp(prefix="play-panel-")
    src = os.path.join(tmp, "panel.html")
    with open(src, "w", encoding="utf-8") as f:
        f.write(html)
    if os.path.exists(out_path):
        os.remove(out_path)
    subprocess.run(
        [
            EDGE, "--headless=new", "--disable-gpu", "--hide-scrollbars",
            "--no-first-run", "--no-default-browser-check",
            f"--user-data-dir={os.path.join(tmp, 'profile')}",
            "--force-device-scale-factor=1", "--virtual-time-budget=10000",
            f"--window-size={width},{height}", f"--screenshot={out_path}", uri(src),
        ],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    # ...so wait for the file to exist and stop growing.
    last = -1
    for _ in range(120):
        size = os.path.getsize(out_path) if os.path.exists(out_path) else -1
        if size > 0 and size == last:
            break
        last = size
        time.sleep(0.5)
    else:
        sys.exit(f"Edge never wrote {out_path}")
    # Edge can hand back a few extra pixels of window chrome; the stores want
    # the exact size.
    Image.open(out_path).convert("RGB").crop((0, 0, width, height)).save(out_path)


def hero(capture, lang):
    """Panels 1 and 2: one scene, one phone straddling the seam."""
    rtl = lang == "ar"
    lines = "<br>".join(COPY[lang]["hero"])
    size = 200 if rtl else 180
    # The copy sits in a column on the left of panel 1; Arabic aligns to that
    # column's right edge so it reads right-to-left without running under the
    # phone.
    align = "right" if rtl else "left"
    body = f"""
      <img src="{uri('assets/icon.png')}" style="position:absolute;left:90px;top:90px;width:130px;border-radius:30px">
      <div class="h" style="top:330px;left:90px;right:auto;width:470px;text-align:{align};font-size:{size}px">{lines}</div>
      {phone(capture, 960, 'left:{0}px;top:150px;transform:perspective(2400px) rotateY(-8deg) rotate(-14deg);'.format(W - 330))}
    """
    html = page(body, W * 2, H, lang, gradient("115deg"))
    scene = os.path.join(tempfile.mkdtemp(prefix="play-hero-"), "scene.png")
    render(html, W * 2, H, scene)
    image = Image.open(scene)
    return [image.crop((0, 0, W, H)).copy(), image.crop((W, 0, W * 2, H)).copy()]


def headline_phone(capture, text, lang, lean, angle, width=930, top=560):
    """Headline over one tilted phone. `width`/`top` shrink and raise the
    phone for a screen whose point is low down (the listing's Call and
    WhatsApp buttons), which the full-size phone would push off the bottom."""
    size = 150 if lang == "ar" else 118
    body = f"""
      <div class="h" style="top:70px;padding:0 110px;font-size:{size}px">{text}</div>
      {phone(capture, width, f'left:{(W - width) // 2}px;top:{top}px;transform:perspective(2400px) rotateY({lean}deg) rotate({-lean/2.5}deg);')}
    """
    return page(body, W, H, lang, gradient(angle))


def caption_below(capture, text, lang):
    """The district panel: the phone hangs from the top edge, caption under it."""
    # The sheet starts about a fifth of the way down the capture, so the phone
    # is raised only that far: the district list and its highlighted row stay
    # in view, the empty map above it goes off the top edge.
    size = 118 if lang == "ar" else 110
    body = f"""
      {phone(capture, 920, 'left:80px;top:-400px;')}
      <div class="h" style="top:1630px;padding:0 90px;font-size:{size}px">{text}</div>
    """
    return page(body, W, H, lang, gradient("0deg"))


def feature_graphic(capture, lang):
    """The 1024x500 banner Play shows above the screenshots. Play overlays a
    play button on it when there's a promo video and can crop its edges, so
    the copy stays inside the middle and the phone is decoration only."""
    rtl = lang == "ar"
    near, far = ("right", "left") if rtl else ("left", "right")
    name = "عقاري" if rtl else "Aqari"
    body = f"""
      <div style="position:absolute;{near}:70px;top:95px;display:flex;align-items:center;gap:22px">
        <img src="{uri('assets/icon.png')}" style="width:104px;border-radius:24px">
        <span style="font-size:{84 if rtl else 76}px;line-height:1">{name}</span>
      </div>
      <div class="h" style="top:245px;{near}:70px;{far}:auto;width:560px;text-align:{near};
           font-size:{52 if rtl else 44}px;line-height:1.2">{COPY[lang]['feature']}</div>
      {phone(capture, 300, f"{far}:90px;top:55px;transform:rotate({-9 if rtl else 9}deg);")}
    """
    return page(body, 1024, 500, lang, gradient("110deg" if not rtl else "250deg"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dir", required=True, help="folder holding the raw captures")
    parser.add_argument("--lang", choices=["ar", "en"], required=True)
    args = parser.parse_args()

    shots = {k: os.path.join(args.dir, f"{args.lang}-{k}.png") for k in ("map", "detail", "add", "district")}
    missing = [p for p in shots.values() if not os.path.exists(p)]
    if missing:
        sys.exit("missing captures: " + ", ".join(missing))

    out_dir = os.path.join(args.dir, "out")
    os.makedirs(out_dir, exist_ok=True)
    copy = COPY[args.lang]

    panels = hero(shots["map"], args.lang)
    for html in (
        headline_phone(shots["detail"], copy["detail"], args.lang, lean=9, angle="125deg",
                       width=760, top=470 if args.lang == "ar" else 500),
        headline_phone(shots["add"], copy["add"], args.lang, lean=-9, angle="235deg"),
        caption_below(shots["district"], copy["district"], args.lang),
    ):
        path = os.path.join(out_dir, "tmp.png")
        render(html, W, H, path)
        panels.append(Image.open(path).copy())
        os.remove(path)

    for index, image in enumerate(panels, start=1):
        path = os.path.join(out_dir, f"play-{args.lang}-{index:02d}.png")
        image.save(path, "PNG")
        print("wrote", path, image.size)

    feature = os.path.join(out_dir, f"play-feature-graphic-{args.lang}.png")
    render(feature_graphic(shots["map"], args.lang), 1024, 500, feature)
    print("wrote", feature, (1024, 500))

    icon = os.path.join(out_dir, "play-icon.png")
    Image.open("assets/icon.png").convert("RGB").resize((512, 512), Image.LANCZOS).save(icon)
    print("wrote", icon, (512, 512))


if __name__ == "__main__":
    main()
