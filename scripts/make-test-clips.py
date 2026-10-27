#!/usr/bin/env python3
"""Synthetic test clips for MediaSheet playlists: numbered cards with a quiet pulsing tone.

10 clips, 10 s, 1920x1080, 30 fps, H.264 + AAC, a keyframe every second (so seeks are close).
Each clip has its own background colour, its number, a seconds counter with a progress bar, and its own pitch
(a major scale from C4), pulsing 0.6 s on / 0.4 s off at about -24 dBFS peak.

usage: make-test-clips.py [out_dir]   (default test_clips/videos in the repo)
"""
import colorsys
import subprocess
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H, FPS, SECONDS = 1920, 1080, 30, 10
PITCHES = [262, 294, 330, 349, 392, 440, 494, 523, 587, 659]  # C4 D4 E4 F4 G4 A4 B4 C5 D5 E5
NOTES = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5', 'D5', 'E5']
GAIN = 0.5  # ffmpeg's sine source peaks at -18 dBFS, so this lands near -24 dBFS: quiet but clearly audible
FONT = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'


def background(i):
    r, g, b = colorsys.hsv_to_rgb(i / len(PITCHES), 0.55, 0.38)
    return (int(r * 255), int(g * 255), int(b * 255))


def centered(d, text, font, y, fill):
    box = d.textbbox((0, 0), text, font=font)
    d.text(((W - (box[2] - box[0])) / 2 - box[0], y), text, font=font, fill=fill)


def clock(s):
    return f'0:{int(s):02d}'


def make(n):
    i = n - 1
    out_dir = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / 'test_clips' / 'videos')
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f'test-clip-{n:02d}-{PITCHES[i]}Hz.mp4'

    base = Image.new('RGB', (W, H), background(i))
    d = ImageDraw.Draw(base)
    d.rectangle([24, 24, W - 25, H - 25], outline=(255, 255, 255), width=6)
    centered(d, 'TEST CLIP', ImageFont.truetype(FONT, 90), 90, (235, 235, 235))
    centered(d, f'{n:02d}', ImageFont.truetype(FONT, 520), 190, (255, 255, 255))
    centered(d, f'{PITCHES[i]} Hz  ({NOTES[i]})', ImageFont.truetype(FONT, 80), 790, (235, 235, 235))
    time_font = ImageFont.truetype(FONT, 56)
    bar = (160, 925, W - 160, 955)

    gate = 'max(0,min(1,min(mod(t,1)/0.03,(0.6-mod(t,1))/0.03)))'
    enc = subprocess.Popen(
        ['ffmpeg', '-y', '-v', 'error',
         '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
         '-f', 'lavfi', '-i', f'sine=frequency={PITCHES[i]}:sample_rate=48000:duration={SECONDS}',
         '-af', f"volume='{gate}':eval=frame,volume={GAIN},aformat=channel_layouts=stereo",
         '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-g', str(FPS), '-keyint_min', str(FPS),
         '-c:a', 'aac', '-b:a', '128k', '-shortest', '-movflags', '+faststart', str(out)],
        stdin=subprocess.PIPE)
    for f in range(FPS * SECONDS):
        frame = base.copy()
        fd = ImageDraw.Draw(frame)
        fd.rectangle(bar, outline=(255, 255, 255), width=4)
        fd.rectangle((bar[0], bar[1], bar[0] + (bar[2] - bar[0]) * f / (FPS * SECONDS - 1), bar[3]), fill=(255, 255, 255))
        t = f / FPS
        fd.text((bar[0], 965), clock(t), font=time_font, fill=(235, 235, 235))
        fd.text((bar[2] - 160, 965), clock(SECONDS), font=time_font, fill=(235, 235, 235))
        enc.stdin.write(frame.tobytes())
    enc.stdin.close()
    if enc.wait() != 0:
        raise SystemExit(f'ffmpeg failed for clip {n}')
    return str(out)


if __name__ == '__main__':
    with ProcessPoolExecutor(max_workers=3) as pool:
        for path in pool.map(make, range(1, len(PITCHES) + 1)):
            print(path)
