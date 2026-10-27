#!/bin/sh
# Placeholder stinger: 2 s, 30 fps, 1920x1080, with alpha.
# A dark bar wipes in from the left (frames 0-29), covers the whole canvas on frames 30-31 (the cut point, 1000 ms), then wipes off to the right.
# Writes ProRes 4444 (.mov) and VP9 alpha (.webm) to cache/stingers/ so the two can be compared in OBS.
set -eu
cd "$(dirname "$0")/.."
out=cache/stingers
mkdir -p "$out"

ALPHA="255*if(lt(N,30),clip((2160*N/30-X)/240,0,1),if(lt(N,32),1,clip((X-(2160*(N-31)/28-240))/240,0,1)))"
SRC="color=c=0x0b0b12:s=1920x1080:r=30:d=2,format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='$ALPHA'"

ffmpeg -y -v error -f lavfi -i "$SRC" -c:v prores_ks -profile:v 4444 -pix_fmt yuva444p10le "$out/placeholder-wipe.mov"
ffmpeg -y -v error -f lavfi -i "$SRC" -c:v libvpx-vp9 -pix_fmt yuva420p -auto-alt-ref 0 -b:v 4M "$out/placeholder-wipe.webm"
ls -l "$out"
