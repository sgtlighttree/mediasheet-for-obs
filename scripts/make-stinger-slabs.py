#!/usr/bin/env python3
"""Graphic stinger for OBS: 2 s, 30 fps, 1920x1080 ProRes 4444 with alpha.

Three slanted slabs (cyan, magenta, dark) sweep in from the left, with a hatch texture, edge lines, an expanding ring, a diamond and chevrons.
The dark slab covers the whole canvas on frames 30 and 31 (cut point = 1000 ms), then the slabs sweep off to the right, dark first.
Also writes an MP4 preview with the stinger over two stand-in scenes that swap at frame 30.

usage: make-stinger-slabs.py [out_dir]   (default ~/Downloads)
"""
import math
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

W, H, FPS, N = 1920, 1080, 30, 60
SS = 2  # supersampling for clean edges
K = 0.36  # slant: x shift per pixel of height
KH = K * H
TRAVEL = W + KH

DARK = (11, 11, 18, 255)
HATCH = (30, 30, 48, 255)
MAG = (255, 56, 120, 255)
CYAN = (32, 211, 243, 255)
WHITE = (255, 255, 255)

# name, colour, enter frames, exit frames. Dark enters last and leaves first, so the colours trail it on both sides.
SLABS = [
    ('cyan', CYAN, (2, 24), (40, 58)),
    ('mag', MAG, (5, 27), (37, 55)),
    ('dark', DARK, (8, 30), (32, 50)),
]


def clamp01(x):
    return max(0.0, min(1.0, x))


def seg(f, a, b):
    return clamp01((f - a) / (b - a))


def ease_io(t):
    return 4 * t ** 3 if t < 0.5 else 1 - (-2 * t + 2) ** 3 / 2


def ease_out_expo(t):
    return 1.0 if t >= 1 else 1 - 2 ** (-10 * t)


def edges(f, enter, leave):
    return ease_io(seg(f, *enter)) * TRAVEL, ease_io(seg(f, *leave)) * TRAVEL  # front, trail


def slab_poly(front, trail):
    if front - trail < 1:
        return None
    return [(trail * SS, 0), (front * SS, 0), ((front - KH) * SS, H * SS), ((trail - KH) * SS, H * SS)]


def slanted_line(d, x_at_top, width, fill):
    d.line([(x_at_top * SS, 0), ((x_at_top - KH) * SS, H * SS)], fill=fill, width=int(width * SS))


def ring(d, r, width, rgba):
    cx, cy = W * SS / 2, H * SS / 2
    d.ellipse([cx - r * SS, cy - r * SS, cx + r * SS, cy + r * SS], outline=rgba, width=max(1, int(width * SS)))


def render(f):
    im = Image.new('RGBA', (W * SS, H * SS), (0, 0, 0, 0))
    d = ImageDraw.Draw(im, 'RGBA')
    fronts = {}
    for name, colour, enter, leave in SLABS:
        front, trail = edges(f, enter, leave)
        fronts[name] = (front, trail)
        poly = slab_poly(front, trail)
        if poly:
            d.polygon(poly, fill=colour)
        if name == 'dark' and poly:
            hatch = Image.new('RGBA', im.size, (0, 0, 0, 0))
            hd = ImageDraw.Draw(hatch)
            for c in range(-int(KH), int(TRAVEL) + 80, 72):
                slanted_line(hd, c + KH, 2, HATCH)
            mask = Image.new('L', im.size, 0)
            ImageDraw.Draw(mask).polygon(poly, fill=255)
            im.paste(hatch, (0, 0), ImageChops.multiply(hatch.getchannel('A'), mask))

    # Accents go on their own layer and are composited at the end: drawing a semi-transparent shape straight onto the slabs would lower their alpha
    ov = Image.new('RGBA', im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)

    # Edge lines: ahead of each front while a slab is entering, on the trail while it leaves
    for name, _, enter, leave in SLABS:
        front, trail = fronts[name]
        if 0 < seg(f, *enter) < 1:
            slanted_line(d, front + 16, 4, WHITE + (230,))
        if 0 < seg(f, *leave) < 1:
            slanted_line(d, trail - 16, 4, WHITE + (200,))

    # Rings burst from the centre at the cut
    for start, width, rgba in ((26, 6, WHITE), (28, 3, MAG[:3])):
        t = seg(f, start, start + 20)
        if 0 < t < 1:
            ring(d, 40 + 900 * ease_out_expo(t), width, rgba + (int(255 * (1 - t) ** 1.5),))

    # Diamond: grows into the cover, shrinks away after it
    s = 170 * ease_out_expo(seg(f, 22, 31)) * (1 - ease_io(seg(f, 33, 44)))
    if s > 2:
        cx, cy = W * SS / 2, H * SS / 2
        r = s * SS
        d.polygon([(cx, cy - r), (cx + r, cy), (cx, cy + r), (cx - r, cy)], outline=WHITE + (255,), width=6 * SS)
        r2 = r * 0.55
        d.polygon([(cx, cy - r2), (cx + r2, cy), (cx, cy + r2), (cx - r2, cy)], fill=MAG)

    # Chevrons ride the magenta front while it enters
    t = seg(f, 5, 27)
    if 0 < t < 1:
        front = fronts['mag'][0]
        for i in range(3):
            x = (front - KH / 2 + 70 + i * 46) * SS
            y = H * SS / 2
            a = int(255 * (1 - i * 0.28) * min(1, t * 6, (1 - t) * 6))
            d.line([(x, y - 34 * SS), (x + 26 * SS, y), (x, y + 34 * SS)], fill=WHITE + (a,), width=8 * SS, joint='curve')

    return Image.alpha_composite(im, ov).resize((W, H), Image.LANCZOS)


def main():
    out = Path(sys.argv[1] if len(sys.argv) > 1 else '~/Downloads').expanduser()
    out.mkdir(parents=True, exist_ok=True)
    mov = out / 'stinger-slabs.mov'
    mp4 = out / 'stinger-slabs-preview.mp4'

    enc = subprocess.Popen(
        ['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
         '-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le', '-vendor', 'apl0', str(mov)],
        stdin=subprocess.PIPE)
    for f in range(N):
        enc.stdin.write(render(f).tobytes())
    enc.stdin.close()
    if enc.wait() != 0:
        sys.exit('ffmpeg failed encoding the stinger')

    # Preview: scene A until the cut point (frame 30), scene B after, the stinger on top
    a = f'gradients=s={W}x{H}:r={FPS}:d=1:c0=0x1d3557:c1=0x457b9d:speed=0.002'
    b = f'gradients=s={W}x{H}:r={FPS}:d=1:c0=0x6a040f:c1=0xf48c06:speed=0.002'
    subprocess.run(
        ['ffmpeg', '-y', '-v', 'error', '-f', 'lavfi', '-i', a, '-f', 'lavfi', '-i', b, '-i', str(mov),
         '-filter_complex', '[0][1]concat=n=2:v=1:a=0[bg];[bg][2:v]overlay=format=auto,format=yuv420p',
         '-c:v', 'libx264', '-crf', '16', '-preset', 'fast', '-movflags', '+faststart', str(mp4)],
        check=True)
    print(mov)
    print(mp4)


if __name__ == '__main__':
    main()
