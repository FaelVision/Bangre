# Voix off de la vidéo de présentation : un fichier WAV par scène de
# narration.json, avec la voix française de Windows (Hortense).
# Usage : powershell -ExecutionPolicy Bypass -File video/tts.ps1 <dossier de sortie>
param([string]$Out = "$PSScriptRoot/out")
Add-Type -AssemblyName System.Speech
$scenes = Get-Content "$PSScriptRoot/narration.json" -Raw -Encoding UTF8 | ConvertFrom-Json
New-Item -ItemType Directory -Force "$Out/audio" | Out-Null
foreach ($s in $scenes) {
  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $synth.SelectVoice("Microsoft Hortense Desktop")
  $synth.Rate = 0
  $synth.SetOutputToWaveFile("$Out/audio/$($s.id).wav")
  $synth.Speak($s.text)
  $synth.Dispose()
}
