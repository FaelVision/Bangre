"""
Voix off naturelle de la vidéo de présentation : un fichier WAV par scène de
narration.json, lu par une voix neuronale de Microsoft (celle de la lecture à
voix haute d'Edge), Denise : plus régulière que les voix multilingues, qui
écorchaient « Bangré ». Seul ce texte est envoyé au service de synthèse.

    pip install edge-tts
    FFMPEG=<chemin de ffmpeg.exe> python video/voix.py [dossier de sortie]

Sans réseau, video/tts.ps1 fait la même chose avec la voix Windows, plus
robotique.
"""

import asyncio
import json
import os
import subprocess
import sys
from pathlib import Path

import edge_tts

VOICE = "fr-FR-DeniseNeural"
HERE = Path(__file__).parent


async def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "out"
    audio = out / "audio"
    audio.mkdir(parents=True, exist_ok=True)
    ffmpeg = os.environ.get("FFMPEG", "ffmpeg")

    scenes = json.loads((HERE / "narration.json").read_text(encoding="utf-8"))
    for scene in scenes:
        mp3 = audio / f"{scene['id']}.mp3"
        await edge_tts.Communicate(scene["text"], VOICE).save(str(mp3))
        # tour.ts reads each clip's length from its WAV header.
        subprocess.run(
            [ffmpeg, "-nostdin", "-loglevel", "error", "-y", "-i", str(mp3), str(audio / f"{scene['id']}.wav")],
            check=True,
        )
        mp3.unlink()
        print(scene["id"])


asyncio.run(main())
