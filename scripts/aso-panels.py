"""App Store panels: one headline per benefit, over a branded background.

    python scripts/aso-panels.py --lang ar --dir "path\\to\\captures"

Reads <lang>-1.png … <lang>-5.png and writes <dir>/out/aso-<lang>-01.png …
at 1290x2796, the size App Store Connect accepts.

Deliberately deterministic: the capture's own pixels are pasted, never
regenerated. The obvious alternative — handing each panel to an image model
to "polish" — redraws the app's UI along with everything else, and a
screenshot showing UI the app doesn't have is both misleading and grounds
for rejection. The device frame and background are drawn here instead.

Headlines come from BENEFITS below, in the order the benefits were
confirmed: verb line first, then the rest, which is the layout that reads
at thumbnail size.
"""

import argparse
import os
import sys

from PIL import Image, ImageDraw, ImageFont

# Loaded by path, because the sibling generator's filename has a dash in it
# and so can't be imported by name.
import importlib.util

_spec = importlib.util.spec_from_file_location(
    "store_screenshots", os.path.join(os.path.dirname(os.path.abspath(__file__)), "store-screenshots.py")
)
_ss = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_ss)

CANVAS = (1290, 2796)
BRAND_BG = (10, 74, 224)          # #0A4AE0 — saturated, from the app's own blue
HEADLINE = (255, 255, 255)
AMBER = (245, 166, 35)

BENEFITS = {
    "ar": [
        ("اعرف السعر", "قبل أن تتصل"),
        ("تواصل مع المالك", "مباشرة"),
        ("أضف عقارك", "مجاناً"),
        ("ابحث حسب", "المنطقة"),
        ("وصلك كل", "عقار جديد"),
    ],
    "en": [
        ("SEE EVERY PRICE", "UPFRONT"),
        ("CONTACT OWNERS", "DIRECTLY"),
        ("LIST YOUR PROPERTY", "FREE"),
        ("SEARCH BY", "DISTRICT"),
        ("GET NEW LISTING", "ALERTS"),
    ],
}


def fitted(text, lang, size, max_width, kind="bold"):
    """Largest font at or below `size` that keeps the line inside max_width."""
    while size > 40:
        fnt = _ss.font(kind, size, lang)
        if fnt.getlength(text) <= max_width:
            return fnt
        size -= 4
    return _ss.font(kind, size, lang)


def panel(capture, verb, rest, lang):
    image = Image.new("RGB", CANVAS, BRAND_BG)
    draw = ImageDraw.Draw(image)

    # Text stays inside the middle ~78% — Apple crops nothing, but a headline
    # running to the edges looks cramped at thumbnail size.
    max_width = round(CANVAS[0] * 0.78)
    y = 190

    verb_text = _ss.shape(verb, lang)
    verb_font = fitted(verb_text, lang, 150, max_width)
    draw.text(((CANVAS[0] - verb_font.getlength(verb_text)) / 2, y), verb_text, font=verb_font, fill=HEADLINE)
    y += round(verb_font.size * 1.14)

    rest_text = _ss.shape(rest, lang)
    rest_font = fitted(rest_text, lang, 104, max_width)
    draw.text(((CANVAS[0] - rest_font.getlength(rest_text)) / 2, y), rest_text, font=rest_font, fill=HEADLINE)
    # Clear of the line above by a full line height: Arabic sits low in its
    # box, and a tighter gap drew the rule straight through the descenders,
    # so it read as a strikethrough.
    y += round(rest_font.size * 1.6)

    draw.rounded_rectangle([(CANVAS[0] - 160) / 2, y, (CANVAS[0] + 160) / 2, y + 12], 6, fill=AMBER)

    # The device runs off the bottom edge rather than floating clear of it:
    # a cropped phone reads as a photograph of a device, a floating one reads
    # as a sticker.
    device = _ss.with_shadow(_ss.phone(capture, 980), blur=44, offset=(0, 22), opacity=95)
    image.paste(device, ((CANVAS[0] - device.width) // 2, y + 120), device)
    return image


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dir", required=True)
    parser.add_argument("--lang", choices=["ar", "en"], required=True)
    args = parser.parse_args()

    out_dir = os.path.join(args.dir, "out")
    os.makedirs(out_dir, exist_ok=True)

    for index, (verb, rest) in enumerate(BENEFITS[args.lang], start=1):
        capture = os.path.join(args.dir, f"{args.lang}-{index}.png")
        if not os.path.exists(capture):
            print("skipping", os.path.basename(capture), "- not found")
            continue
        out_path = os.path.join(out_dir, f"aso-{args.lang}-{index:02d}.png")
        panel(capture, verb, rest, args.lang).save(out_path, "PNG")
        print("wrote", out_path)


if __name__ == "__main__":
    main()
