#!/usr/bin/env python3
"""Seek-accuracy probe clips: 20 s, 1920x1080, 30 fps, with real motion and a burned-in frame number and MM:SS:FF timecode.

Color bars, a grid, a sweeping bar and a clock hand, so a seek can be read straight off a screenshot (the counter says where it landed)
and a frozen or stale frame is obvious. One render, several encodes of the same frames so they compare directly:

  h264-gop150   keyframe every 5 s (0, 5, 10, 15): long gaps, the hard case
  h264-gop30    keyframe every 1 s
  h264-intra    every frame a keyframe (all-intra H.264)
  prores422     ProRes 422 (every frame intra)
  prores-proxy  ProRes 422 Proxy (every frame intra, small)

usage: make-seek-probe.py [out_dir]   (default test_clips/probes in the repo)
"""
import math
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H, FPS, SECONDS = 1920, 1080, 30, 20
FONT = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'
BARS = [(192, 192, 192), (192, 192, 0), (0, 192, 192), (0, 192, 0), (192, 0, 192), (192, 0, 0), (0, 0, 192)]


def base_frame():
    im = Image.new('RGB', (W, H), (16, 16, 24))
    d = ImageDraw.Draw(im)
    bw = W / len(BARS)
    for i, c in enumerate(BARS):
        d.rectangle([i * bw, 0, (i + 1) * bw, 330], fill=c)
    # grayscale ramp under the bars
    for x in range(W):
        v = int(255 * x / W)
        d.line([(x, 330), (x, 400)], fill=(v, v, v))
    # grid
    for x in range(0, W, 120):
        d.line([(x, 400), (x, H)], fill=(60, 60, 80), width=2)
    for y in range(400, H, 120):
        d.line([(0, y), (W, y)], fill=(60, 60, 80), width=2)
    # circle + crosshair
    cx, cy, r = 1500, 740, 260
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(200, 200, 200), width=4)
    d.line([(cx - r, cy), (cx + r, cy)], fill=(120, 120, 140), width=2)
    d.line([(cx, cy - r), (cx, cy + r)], fill=(120, 120, 140), width=2)
    return im


def main():
    out = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / 'test_clips' / 'probes')
    out.mkdir(parents=True, exist_ok=True)
    big = ImageFont.truetype(FONT, 190)
    mid = ImageFont.truetype(FONT, 90)
    base = base_frame()
    cx, cy, r = 1500, 740, 260

    # One decode of the rendered frames, five encodes
    outputs = [
        ('h264-gop150.mp4', ['-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-g', '150', '-keyint_min', '150', '-sc_threshold', '0', '-pix_fmt', 'yuv420p']),
        ('h264-gop30.mp4', ['-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-g', '30', '-keyint_min', '30', '-sc_threshold', '0', '-pix_fmt', 'yuv420p']),
        ('h264-intra.mp4', ['-c:v', 'libx264', '-crf', '18', '-preset', 'medium', '-g', '1', '-pix_fmt', 'yuv420p']),
        ('prores422.mov', ['-c:v', 'prores_ks', '-profile:v', '2', '-pix_fmt', 'yuv422p10le']),
        ('prores-proxy.mov', ['-c:v', 'prores_ks', '-profile:v', '0', '-pix_fmt', 'yuv422p10le']),
    ]
    cmd = ['ffmpeg', '-y', '-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-']
    for name, args in outputs:
        cmd += ['-map', '0:v', *args, '-movflags', '+faststart', str(out / f'seek-probe-{name}')]
    enc = subprocess.Popen(cmd, stdin=subprocess.PIPE)

    for f in range(FPS * SECONDS):
        im = base.copy()
        d = ImageDraw.Draw(im)
        t = f / FPS
        # sweeping bar (2 s per pass), clock hand (4 s per turn)
        x = int((t % 2) / 2 * W)
        d.rectangle([x, 400, x + 36, H], fill=(255, 255, 255))
        a = 2 * math.pi * (t % 4) / 4 - math.pi / 2
        d.line([(cx, cy), (cx + r * math.cos(a), cy + r * math.sin(a))], fill=(255, 60, 60), width=10)
        # burned-in counters (kept off the moving elements' lanes where possible)
        sec, frame = divmod(f, FPS)
        d.rectangle([40, 420, 1040, 780], fill=(0, 0, 0))
        d.text((60, 430), f'F {f:04d}', font=big, fill=(255, 255, 255))
        d.text((60, 640), f'TC 00:{sec:02d}:{frame:02d}', font=mid, fill=(255, 220, 80))
        im_bytes = im.tobytes()
        enc.stdin.write(im_bytes)
    enc.stdin.close()
    if enc.wait() != 0:
        sys.exit('ffmpeg failed')
    for name, _ in outputs:
        p = out / f'seek-probe-{name}'
        print(f'{p.name}  {p.stat().st_size / 1e6:.1f} MB')


if __name__ == '__main__':
    main()
