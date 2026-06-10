"""
Generate Wayamesh app icon and splash screen.
Exact match to the onboarding logo: dark bg, teal dashed ring, teal dot. No glow.
"""
from PIL import Image, ImageDraw, ImageFont
import math
import os

BG     = (7, 7, 15, 255)      # #07070F
ACCENT = (62, 217, 184, 255)  # #3ED9B8

OUT = os.path.join(os.path.dirname(__file__), '..', 'assets')


def draw_dashed_ring(draw, cx, cy, radius, stroke, dash_len, gap_len, color):
    circumference = 2 * math.pi * radius
    dash_angle = (dash_len / circumference) * 360
    gap_angle  = (gap_len  / circumference) * 360
    step  = dash_angle + gap_angle
    angle = -90
    while angle < 270:
        end  = min(angle + dash_angle, 270)
        bbox = [cx - radius - stroke / 2, cy - radius - stroke / 2,
                cx + radius + stroke / 2, cy + radius + stroke / 2]
        draw.arc(bbox, start=angle, end=end, fill=color, width=stroke)
        angle += step


def draw_logo(draw, cx, cy, ring_r, stroke, dot_r, color):
    draw_dashed_ring(draw, cx, cy, ring_r, stroke,
                     dash_len=ring_r * 0.55,
                     gap_len=ring_r * 0.22,
                     color=color)
    draw.ellipse([cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r], fill=color)


def load_font(size):
    for p in [
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
        '/usr/share/fonts/truetype/freefont/FreeSansBold.ttf',
    ]:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def make_icon():
    size = 1024
    img  = Image.new('RGBA', (size, size), BG)
    draw = ImageDraw.Draw(img)
    cx = cy = size // 2
    draw_logo(draw, cx, cy, ring_r=290, stroke=30, dot_r=75, color=ACCENT)
    img.save(os.path.join(OUT, 'icon.png'))
    print('Saved icon.png')


def make_adaptive_icon():
    size = 1024
    img  = Image.new('RGBA', (size, size), BG)
    draw = ImageDraw.Draw(img)
    cx = cy = size // 2
    draw_logo(draw, cx, cy, ring_r=270, stroke=28, dot_r=68, color=ACCENT)
    img.save(os.path.join(OUT, 'adaptive-icon.png'))
    print('Saved adaptive-icon.png')


def make_splash():
    w, h = 1284, 2778
    img  = Image.new('RGBA', (w, h), BG)
    draw = ImageDraw.Draw(img)
    cx   = w // 2
    cy   = h // 2 - 80

    draw_logo(draw, cx, cy, ring_r=310, stroke=32, dot_r=80, color=ACCENT)

    font = load_font(88)
    text = 'WAYAMESH'
    bbox = draw.textbbox((0, 0), text, font=font)
    tw   = bbox[2] - bbox[0]
    draw.text((cx - tw // 2, cy + 310 + 32 + 52), text, font=font, fill=ACCENT)

    img.save(os.path.join(OUT, 'splash.png'))
    print('Saved splash.png')


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    make_icon()
    make_adaptive_icon()
    make_splash()
    print('Done.')
