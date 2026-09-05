import json
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta
from pathlib import Path


URL = "https://www.cboe.com/us/options/market_statistics/daily/"
OUTPUT = Path(__file__).resolve().parent / "options_sentiment.json"


def download(url):
    request = urllib.request.Request(url, headers={"User-Agent": "InvestDashboard/1.0"})
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read().decode("utf-8")


def ratio(page, name):
    match = re.search(re.escape(name) + r'</td><td[^>]*>([0-9.]+)</td>', page)
    if not match:
        raise RuntimeError(f"Missing Cboe ratio: {name}")
    return float(match.group(1))


def parse_page(page):
    date_match = re.search(r'placeholder="yyyy/mm/dd" value="([^"]+)"', page)
    if not date_match:
        raise RuntimeError("Missing Cboe observation date")
    return {
        "date": datetime.strptime(date_match.group(1), "%d %B %Y").date().isoformat(),
        "index_pc": ratio(page, "INDEX PUT/CALL RATIO"),
        "equity_pc": ratio(page, "EQUITY PUT/CALL RATIO"),
    }


latest = parse_page(download(URL))

try:
    existing = json.loads(OUTPUT.read_text(encoding="utf-8"))
    rows = existing.get("rows", [])
except (FileNotFoundError, json.JSONDecodeError):
    rows = []

by_date = {item["date"]: item for item in rows if item.get("date")}
by_date[latest["date"]] = latest

if len(by_date) < 21:
    latest_date = datetime.strptime(latest["date"], "%Y-%m-%d").date()
    dates = [latest_date - timedelta(days=offset) for offset in range(1, 40)]
    dates = [day for day in dates if day.weekday() < 5 and day.isoformat() not in by_date]
    with ThreadPoolExecutor(max_workers=6) as executor:
        jobs = {
            executor.submit(download, URL + "?dt=" + day.isoformat()): day
            for day in dates
        }
        for job in as_completed(jobs):
            try:
                historical = parse_page(job.result())
                by_date[historical["date"]] = historical
            except Exception as exc:
                print(f"Skipped {jobs[job].isoformat()}: {exc}")

rows = list(by_date.values())
rows = sorted(rows, key=lambda item: item["date"])[-65:]
OUTPUT.write_text(json.dumps({"updated_at": latest["date"], "rows": rows}, indent=2), encoding="utf-8")
