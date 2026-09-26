"""
Voix off du spot promo : une voix neuronale française de Microsoft (celle de
la lecture à voix haute d'Edge), Denise, plus régulière que les voix
multilingues qui écorchaient « Bangré ». Un WAV 48 kHz stéréo par phrase de
promo-narration.json, silences de début et de fin retirés, dans
video/out/promo/voix/. Seul ce texte est envoyé au service de synthèse.

    pip install edge-tts
    FFMPEG=<chemin de ffmpeg.exe> python video/promo-voix.py
"""

import asyncio
import json
import os
import subprocess
import wave
from array import array
from pathlib import Path

import edge_tts

VOICE = "fr-FR-DeniseNeural"
HERE = Path(__file__).parent
# Retire le silence de tête, puis celui de queue (en retournant le son).
TRIM = "silenceremove=start_periods=1:start_threshold=-45dB,areverse," \
       "silenceremove=start_periods=1:start_threshold=-45dB,areverse"
MAX_GAP = 0.45  # secondes : les blancs d'environ 1 s entre deux phrases traînent


def tighten(wav: Path) -> None:
    """Ramène chaque blanc plus long que MAX_GAP à MAX_GAP (fenêtres de 10 ms sous -35 dBFS)."""
    with wave.open(str(wav)) as w:
        params, rate = w.getparams(), w.getframerate()
        pcm = array("h", w.readframes(w.getnframes()))
    step = rate // 100 * params.nchannels
    limit = 32768 * 10 ** (-35 / 20)
    quiet = [max(abs(x) for x in pcm[i : i + step]) < limit for i in range(0, len(pcm), step)]
    keep, i = array("h"), 0
    while i < len(quiet):
        j = i
        while j < len(quiet) and quiet[j] == quiet[i]:
            j += 1
        chunk = pcm[i * step : j * step]
        if quiet[i] and (j - i) / 100 > MAX_GAP:
            half = int(MAX_GAP * 50) * step
            chunk = chunk[:half] + chunk[-half:]
        keep.extend(chunk)
        i = j
    with wave.open(str(wav), "wb") as w:
        w.setparams(params)
        w.writeframes(keep.tobytes())


async def main() -> None:
    out = HERE / "out" / "promo" / "voix"
    out.mkdir(parents=True, exist_ok=True)
    ffmpeg = os.environ.get("FFMPEG", "ffmpeg")

    for line in json.loads((HERE / "promo-narration.json").read_text(encoding="utf-8")):
        mp3 = out / f"{line['id']}.mp3"
        wav = out / f"{line['id']}.wav"
        await edge_tts.Communicate(line["text"], VOICE).save(str(mp3))
        subprocess.run(
            [ffmpeg, "-nostdin", "-loglevel", "error", "-y", "-i", str(mp3), "-af", TRIM,
             "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", str(wav)],
            check=True,
        )
        mp3.unlink()
        tighten(wav)
        print(line["id"])


asyncio.run(main())
