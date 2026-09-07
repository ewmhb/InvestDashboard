import json
import urllib.request
from pathlib import Path


URL = "https://production.dataviz.cnn.io/index/fearandgreed/graphdata"
OUTPUT = Path(__file__).resolve().parent / "fear_greed.json"

request = urllib.request.Request(
    URL,
    headers={
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
        "Referer": "https://www.cnn.com/markets/fear-and-greed",
        "Accept": "application/json,text/plain,*/*",
    },
)

with urllib.request.urlopen(request, timeout=90) as response:
    payload = json.load(response)

history = payload.get("fear_and_greed_historical", {}).get("data", [])
if len(history) < 2:
    raise RuntimeError("CNN Fear & Greed history is missing")

OUTPUT.write_text(json.dumps(payload, indent=2), encoding="utf-8")
