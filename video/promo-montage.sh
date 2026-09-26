#!/usr/bin/env bash
# Montage du spot promo d'une minute, 30 i/s.
#
#   FFMPEG=<ffmpeg.exe> bash video/promo-montage.sh              (1920×1080 → Bangré-promo.mp4)
#   FFMPEG=<ffmpeg.exe> bash video/promo-montage.sh vertical     (1080×1920, téléphone
#                                                                  → Bangré-promo-telephone.mp4)
#
# Entrées : plans de l'application (promo-capture.ts : app.webm, ou app-mobile.mp4
# pour le téléphone), cartons (promo-render.ts : cards/ ou cards-v/), voix off
# voix/v1..v7.wav (promo-voix.py, voix Denise), tout dans video/out/promo/.
set -euo pipefail
cd "$(dirname "$0")/out/promo"
FF="${FFMPEG:-ffmpeg}"
V="${VOIX:-voix}"
ENC=(-c:v h264_nvenc -preset p7 -rc vbr -cq 24 -b:v 0 -maxrate 6M -bufsize 12M -pix_fmt yuv420p -r 30
     -c:a aac -b:a 192k -ar 48000 -ac 2)

if [ "${1:-}" = vertical ]; then
  CARDS=cards-v; APP=app-mobile.mp4; OUT="../Bangré-promo-telephone.mp4"; SEG=seg-v
  # Écran de téléphone 828×1792 mis à 860 de large, bas coupé pour tenir dans le cadre.
  FIT="scale=860:-2:flags=lanczos,crop=860:1450:0:0"; AT="110:380"
  # Plans dans app-mobile.mp4 (marks-mobile.json), sans la frappe de la recherche.
  DASHBOARD=(3.4 11.4); PAIEMENT=(13.4 27.4); RETARDS=(28.0 42.2); HORSLIGNE=(42.2 54.3)
else
  CARDS=cards; APP=app.webm; OUT="../Bangré-promo.mp4"; SEG=seg
  FIT="scale=1536:864:flags=lanczos"; AT="192:176"
  DASHBOARD=(3.6 11.6); PAIEMENT=(13.0 26.3); RETARDS=(27.0 39.8); HORSLIGNE=(39.8 49.2)
fi
mkdir -p "$SEG"

# Carton animé : images + une voix posée à <retard> secondes.
card() { # nom durée voix retard [début dans la voix]
  "$FF" -nostdin -loglevel error -y -framerate 30 -i "$CARDS/$1/%04d.jpg" -ss "${5:-0}" -i "$3" \
    -filter_complex "[1:a]adelay=$(awk "BEGIN{print int($4*1000)}"):all=1,apad[a]" \
    -map 0:v -map "[a]" -t "$2" "${ENC[@]}" "$SEG/$1.mp4"
}
# Plan de l'application : extrait [début, fin] accéléré pour tenir <durée>, dans son cadre.
shot() { # nom début fin durée voix [début dans la voix]
  local k; k=$(awk "BEGIN{print ($3-$2)/$4}")
  "$FF" -nostdin -loglevel error -y -loop 1 -framerate 30 -t "$4" -i "$CARDS/f-$1.png" \
    -ss "$2" -to "$3" -i "$APP" -ss "${6:-0}" -i "$5" \
    -filter_complex "[1:v]setpts=(PTS-STARTPTS)/$k,fps=30,$FIT[s];[0:v][s]overlay=$AT:shortest=0,trim=duration=$4[v];[2:a]adelay=300:all=1,apad[a]" \
    -map "[v]" -map "[a]" -t "$4" "${ENC[@]}" "$SEG/$1.mp4"
}

card hook 9.6 "$V/v1.wav" 0.3
"$FF" -nostdin -loglevel error -y -i "$V/v2.wav" -t 4.35 "$SEG/v2a.wav"
card brand 5.0 "$SEG/v2a.wav" 0.3
shot dashboard "${DASHBOARD[@]}" 6.6 "$V/v2.wav" 4.35
shot paiement "${PAIEMENT[@]}" 9.3 "$V/v3.wav"
shot retards "${RETARDS[@]}" 8.3 "$V/v4.wav"
shot horsligne "${HORSLIGNE[@]}" 8.6 "$V/v5.wav"
card benefits 4.6 "$V/v6.wav" 0.3
card end 5.8 "$V/v7.wav" 0.3

printf "file '%s.mp4'\n" hook brand dashboard paiement retards horsligne benefits end > "$SEG/list.txt"
# Collage, voix mise au niveau des réseaux sociaux (-14 LUFS), fondu de fin.
"$FF" -nostdin -loglevel error -y -f concat -safe 0 -i "$SEG/list.txt" \
  -af "loudnorm=I=-14:TP=-1.5:LRA=11,afade=t=out:st=57.0:d=0.8" -vf "fade=t=out:st=57.0:d=0.8" \
  "${ENC[@]}" -movflags +faststart "$OUT"
echo "vidéo : video/out/${OUT#../}"
