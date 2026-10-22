#!/usr/bin/env bash
# Trims silence from each voice line and records the trimmed durations.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p audio/vo_trim
for f in audio/vo/*.mp3; do
  n=$(basename "$f" .mp3)
  ffmpeg -v error -y -i "$f" -af "silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.02,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.05,areverse" -ar 48000 "audio/vo_trim/$n.wav"
done
python3 - <<'EOF'
import glob, json, os, subprocess
d = {}
for f in sorted(glob.glob('audio/vo_trim/*.wav')):
    out = subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f])
    d[os.path.basename(f)[:-4]] = round(float(out), 3)
json.dump(d, open('vo-durations.json', 'w'), indent=1)
print(d)
EOF
