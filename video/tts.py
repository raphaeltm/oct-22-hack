import json, os, sys, urllib.request
key = os.environ["ELEVENLABS_API_KEY"]
voice = sys.argv[1]; model = sys.argv[2]; outdir = sys.argv[3]
only = sys.argv[4].split(",") if len(sys.argv) > 4 else None
lines = json.load(open("lines.json"))
os.makedirs(outdir, exist_ok=True)
for i, (name, text) in enumerate(lines):
    if only and name not in only: continue
    body = {"text": text, "model_id": model,
            "voice_settings": {"stability": 0.55, "similarity_boost": 0.8, "style": 0.15, "use_speaker_boost": True, "speed": 0.98}}
    if model in ("eleven_multilingual_v2", "eleven_turbo_v2_5", "eleven_flash_v2_5"):
        if i > 0: body["previous_text"] = lines[i-1][1]
        if i < len(lines)-1: body["next_text"] = lines[i+1][1]
    req = urllib.request.Request(f"https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_128",
        data=json.dumps(body).encode(), headers={"xi-api-key": key, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r: open(f"{outdir}/{name}.mp3", "wb").write(r.read())
        print("ok", name)
    except urllib.error.HTTPError as e:
        print("ERR", name, e.code, e.read()[:300]); sys.exit(1)
