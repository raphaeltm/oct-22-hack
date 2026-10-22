import json, os, sys, subprocess, glob
key = os.environ["ELEVENLABS_API_KEY"]
out = {}
for f in sorted(glob.glob(sys.argv[1] + "/*.wav")):
    name = os.path.basename(f)[:-4]
    r = subprocess.run(["curl", "-s", "-X", "POST", "https://api.elevenlabs.io/v1/speech-to-text",
        "-H", f"xi-api-key: {key}", "-F", f"model_id={sys.argv[2] if len(sys.argv)>2 else 'scribe_v1'}", "-F", f"file=@{f}",
        "-F", "language_code=en", "-F", "tag_audio_events=false"], capture_output=True, text=True)
    d = json.loads(r.stdout)
    if "words" not in d: print("ERR", name, r.stdout[:300]); sys.exit(1)
    out[name] = {"text": d["text"], "words": [[w["text"], round(w["start"], 3), round(w["end"], 3)] for w in d["words"] if w.get("type") == "word"]}
    print(name, "|", d["text"])
json.dump(out, open("vo-words.json", "w"), ensure_ascii=False, indent=0)
