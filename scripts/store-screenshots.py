"""Build App Store screenshots from raw iPhone captures.

Apple wants 1290x2796 (the 6.9" iPhone size); an iPhone 17e captures
1170x2532, which the upload rejects. This scales the capture, puts it in a
tilted phone body, and lays that over a branded panel.

The first two panels share one scene: a pair of phones angled across the
seam, with the headline on the left — the layout most property apps use on
the store, and the one that reads as a single image when someone swipes.
Every later panel is one upright phone with a caption above it.

    python scripts/store-screenshots.py --lang ar --dir path\\to\\captures

Captures are read in filename order: <lang>-1.png, <lang>-2.png, ... The
first two are the pair. Output lands in <dir>/out/.

Arabic is reshaped and bidi-ordered before drawing: Pillow draws glyphs in
the order given, so unshaped Arabic comes out as disconnected letters in
reverse.
"""

import argparse
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

try:
    import arabic_reshaper
    from bidi.algorithm import get_display
except ImportError:  # pragma: no cover - only needed for --lang ar
    arabic_reshaper = None
    get_display = None

# Apple's 6.9" iPhone size. The only iPhone set the store now requires.
CANVAS = (1290, 2796)

INK = (11, 27, 51)
INK_MUTED = (89, 99, 122)
BRAND = (0, 102, 255)
AMBER = (245, 166, 35)
GROUND_TOP = (255, 255, 255)
GROUND_BOTTOM = (214, 229, 255)

FONT_DIR = r"C:\Windows\Fonts"
# Per language, because Segoe UI Black carries no Arabic: an Arabic headline
# set in it comes out as a row of empty boxes. Segoe UI Bold covers both.
FONTS = {
    "en": {
        "bold": os.path.join(FONT_DIR, "seguibl.ttf"),      # Segoe UI Black
        "semibold": os.path.join(FONT_DIR, "seguisb.ttf"),  # Segoe UI Semibold
    },
    "ar": {
        "bold": os.path.join(FONT_DIR, "segoeuib.ttf"),     # Segoe UI Bold
        "semibold": os.path.join(FONT_DIR, "seguisb.ttf"),
    },
}

COPY = {
    "ar": {
        "wordmark": "عقاري",
        "headline": ["الطريقة الأسهل", "للبحث عن عقار", "في ليبيا"],
        "sub": "تصفّح على الخريطة · تواصل مباشرة",
        "captions": [
            "كل العقارات على الخريطة",
            "تفاصيل كاملة وصور",
            "فلاتر دقيقة حسب المدينة والمنطقة",
            "أضف عقارك في دقائق",
            "ملف البائع وكل إعلاناته",
        ],
    },
    "en": {
        "wordmark": "Aqari",
        "headline": ["The simpler way", "to find property", "in Libya"],
        "sub": "Browse the map · contact owners directly",
        "captions": [
            "Every listing on one map",
            "Full details and photos",
            "Filter by city and district",
            "List your property in minutes",
            "Seller profiles and their listings",
        ],
    },
}


def shape(text, lang):
    """Arabic needs reshaping and bidi ordering before Pillow draws it."""
    if lang != "ar":
        return text
    if arabic_reshaper is None:
        sys.exit("Arabic needs: pip install arabic-reshaper python-bidi")
    return get_display(arabic_reshaper.reshape(text))


def font(kind, size, lang):
    return ImageFont.truetype(FONTS[lang][kind], size)


def gradient(size, top, bottom):
    base = Image.new("RGB", (1, size[1]))
    pixels = base.load()
    for y in range(size[1]):
        ratio = y / max(size[1] - 1, 1)
        pixels[0, y] = tuple(round(a + (b - a) * ratio) for a, b in zip(top, bottom))
    return base.resize(size, Image.BILINEAR)


def rounded_mask(size, radius):
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size[0] - 1, size[1] - 1], radius, fill=255)
    return mask


def phone(capture_path, screen_width=980):
    """One capture inside a phone body, upright, as an RGBA image."""
    shot = Image.open(capture_path).convert("RGB")
    screen_height = round(screen_width * shot.height / shot.width)
    shot = shot.resize((screen_width, screen_height), Image.LANCZOS)

    bezel = round(screen_width * 0.022)
    radius = round(screen_width * 0.115)
    body = Image.new("RGBA", (screen_width + bezel * 2, screen_height + bezel * 2), (0, 0, 0, 0))
    frame = Image.new("RGBA", body.size, (17, 18, 21, 255))
    frame.putalpha(rounded_mask(body.size, radius + bezel))
    body.alpha_composite(frame)

    screen = shot.convert("RGBA")
    screen.putalpha(rounded_mask(screen.size, radius))
    body.alpha_composite(screen, (bezel, bezel))

    # The pill cut out of the top of the display, so the capture doesn't look
    # like a flat rectangle pasted into a frame.
    island_w, island_h = round(screen_width * 0.30), round(screen_width * 0.078)
    island = Image.new("RGBA", (island_w, island_h), (0, 0, 0, 0))
    ImageDraw.Draw(island).rounded_rectangle(
        [0, 0, island_w - 1, island_h - 1], island_h // 2, fill=(17, 18, 21, 255)
    )
    body.alpha_composite(island, ((body.width - island_w) // 2, bezel + round(screen_width * 0.012)))
    return body


def solve_perspective(source, target):
    """Coefficients for Image.transform(PERSPECTIVE), mapping target -> source.

    Eight unknowns from four point pairs, by Gaussian elimination — small
    enough not to be worth a numpy dependency.
    """
    matrix = []
    for (sx, sy), (tx, ty) in zip(source, target):
        matrix.append([tx, ty, 1, 0, 0, 0, -sx * tx, -sx * ty, sx])
        matrix.append([0, 0, 0, tx, ty, 1, -sy * tx, -sy * ty, sy])

    for col in range(8):
        pivot = max(range(col, 8), key=lambda r: abs(matrix[r][col]))
        matrix[col], matrix[pivot] = matrix[pivot], matrix[col]
        for row in range(8):
            if row == col:
                continue
            factor = matrix[row][col] / matrix[col][col]
            matrix[row] = [a - factor * b for a, b in zip(matrix[row], matrix[col])]
    return [matrix[i][8] / matrix[i][i] for i in range(8)]


def tilt(image, lean=0.055, rise=0.03):
    """Perspective tilt: the far edge shortens, the near edge stays put."""
    w, h = image.size
    pad = round(w * 0.14)
    canvas = Image.new("RGBA", (w + pad * 2, h + pad * 2), (0, 0, 0, 0))
    canvas.alpha_composite(image, (pad, pad))
    w, h = canvas.size

    near_top, far_top = pad, pad + round(h * rise)
    corners = [
        (pad, near_top),                       # top-left, nearest
        (w - pad, far_top),                    # top-right, further away
        (w - pad - round(w * lean), h - pad - round(h * rise)),
        (pad + round(w * lean * 0.15), h - pad),
    ]
    box = [(0, 0), (w, 0), (w, h), (0, h)]
    coeffs = solve_perspective(box, corners)
    return canvas.transform((w, h), Image.PERSPECTIVE, coeffs, Image.BICUBIC)


def with_shadow(image, blur=38, offset=(0, 26), opacity=110):
    shadow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    shadow.paste((8, 20, 48, opacity), (0, 0), image.split()[3])
    shadow = shadow.filter(ImageFilter.GaussianBlur(blur))
    out = Image.new("RGBA", (image.width + 80, image.height + 80), (0, 0, 0, 0))
    out.alpha_composite(shadow, (40 + offset[0], 40 + offset[1]))
    out.alpha_composite(image, (40, 40))
    return out


def draw_text(draw, xy, text, fnt, fill, lang, anchor_right=False):
    width = draw.textlength(text, font=fnt)
    x = xy[0] - width if anchor_right else xy[0]
    draw.text((x, xy[1]), text, font=fnt, fill=fill)
    return width


def hero(captures, lang, logo_path):
    """Panels 1 and 2: one scene, two phones, sliced down the middle."""
    copy = COPY[lang]
    rtl = lang == "ar"
    scene = gradient((CANVAS[0] * 2, CANVAS[1]), GROUND_TOP, GROUND_BOTTOM).convert("RGBA")
    draw = ImageDraw.Draw(scene)

    margin = 110
    text_x = CANVAS[0] - margin if rtl else margin
    y = 300

    logo = Image.open(logo_path).convert("RGBA").resize((132, 132), Image.LANCZOS)
    logo.putalpha(rounded_mask(logo.size, 30))
    scene.alpha_composite(logo, (text_x - 132 if rtl else text_x, y))
    wordmark = font("bold", 86, lang)
    draw_text(
        draw,
        (text_x - 160 if rtl else text_x + 160, y + 18),
        shape(copy["wordmark"], lang),
        wordmark,
        INK,
        lang,
        anchor_right=rtl,
    )

    y += 250
    headline = font("bold", 104, lang)
    for line in copy["headline"]:
        draw_text(draw, (text_x, y), shape(line, lang), headline, INK, lang, anchor_right=rtl)
        y += 128

    y += 54
    draw.rounded_rectangle(
        [text_x - 150, y, text_x, y + 12] if rtl else [text_x, y, text_x + 150, y + 12],
        6,
        fill=AMBER,
    )

    y += 70
    sub = font("semibold", 46, lang)
    draw_text(draw, (text_x, y), shape(copy["sub"], lang), sub, INK_MUTED, lang, anchor_right=rtl)

    # Two phones, the front one crossing the seam so the pair reads as one
    # picture when someone swipes between the first two screenshots.
    back = with_shadow(tilt(phone(captures[1], 860), lean=0.075))
    front = with_shadow(tilt(phone(captures[0], 940)))
    # Anchored off the finished sizes rather than fixed pixels: the tilt and
    # shadow both change the image's bounds, and a hand-tuned y put the front
    # phone half off the bottom of the panel.
    front_x = CANVAS[0] - front.width // 2 + 300
    front_y = CANVAS[1] - front.height + 90
    scene.alpha_composite(back, (front_x + 600, max(front_y - 320, 300)))
    scene.alpha_composite(front, (front_x, front_y))

    left = scene.crop((0, 0, CANVAS[0], CANVAS[1])).convert("RGB")
    right = scene.crop((CANVAS[0], 0, CANVAS[0] * 2, CANVAS[1])).convert("RGB")
    return [left, right]


def plain(capture, caption, lang):
    """One upright phone under a caption."""
    panel = gradient(CANVAS, GROUND_TOP, GROUND_BOTTOM).convert("RGBA")
    draw = ImageDraw.Draw(panel)
    fnt = font("bold", 76, lang)
    text = shape(caption, lang)
    width = draw.textlength(text, font=fnt)
    draw.text(((CANVAS[0] - width) / 2, 210), text, font=fnt, fill=INK)
    draw.rounded_rectangle(
        [(CANVAS[0] - 150) / 2, 350, (CANVAS[0] + 150) / 2, 362], 6, fill=AMBER
    )

    device = with_shadow(phone(capture, 1010), blur=46, offset=(0, 30), opacity=90)
    panel.alpha_composite(device, ((CANVAS[0] - device.width) // 2, 470))
    return panel.convert("RGB")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dir", required=True, help="folder holding the raw captures")
    parser.add_argument("--lang", choices=["ar", "en"], required=True)
    parser.add_argument("--logo", default="assets/icon.png")
    args = parser.parse_args()

    captures = sorted(
        os.path.join(args.dir, name)
        for name in os.listdir(args.dir)
        if name.lower().startswith(args.lang) and name.lower().endswith((".png", ".jpg", ".jpeg"))
    )
    if len(captures) < 2:
        sys.exit(f"Need at least two captures named {args.lang}-1.png, {args.lang}-2.png in {args.dir}")

    out_dir = os.path.join(args.dir, "out")
    os.makedirs(out_dir, exist_ok=True)

    panels = hero(captures[:2], args.lang, args.logo)
    captions = COPY[args.lang]["captions"]
    for index, capture in enumerate(captures[2:]):
        panels.append(plain(capture, captions[min(index + 2, len(captions) - 1)], args.lang))

    for index, panel in enumerate(panels, start=1):
        path = os.path.join(out_dir, f"{args.lang}-{index:02d}.png")
        panel.save(path, "PNG")
        print("wrote", path, panel.size)


if __name__ == "__main__":
    main()
