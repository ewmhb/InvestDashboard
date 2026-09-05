import json
import re
import urllib.request
from datetime import datetime
from pathlib import Path


URL = "https://www.cboe.com/us/options/market_statistics/daily/"
OUTPUT = Path(__file__).resolve().parent / "options_sentiment.json"


request = urllib.request.Request(URL, headers={"User-Agent": "InvestDashboard/1.0"})
with urllib.request.urlopen(request, timeout=90) as response:
    page = response.read().decode("utf-8")


def ratio(name):
    match = re.search(re.escape(name) + r'</td><td[^>]*>([0-9.]+)</td>', page)
    if not match:
        raise RuntimeError(f"Missing Cboe ratio: {name}")
    return float(match.group(1))


date_match = re.search(r'placeholder="yyyy/mm/dd" value="([^"]+)"', page)
if not date_match:
    raise RuntimeError("Missing Cboe observation date")
observation_date = datetime.strptime(date_match.group(1), "%d %B %Y").date().isoformat()

row = {
    "date": observation_date,
    "index_pc": ratio("INDEX PUT/CALL RATIO"),
    "equity_pc": ratio("EQUITY PUT/CALL RATIO"),
}

try:
    existing = json.loads(OUTPUT.read_text(encoding="utf-8"))
    rows = existing.get("rows", [])
except (FileNotFoundError, json.JSONDecodeError):
    rows = []

rows = [item for item in rows if item.get("date") != row["date"]]
rows.append(row)
rows = sorted(rows, key=lambda item: item["date"])[-65:]
OUTPUT.write_text(json.dumps({"updated_at": row["date"], "rows": rows}, indent=2), encoding="utf-8")
