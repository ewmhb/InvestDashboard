import csv
import io
import json
import time
import urllib.parse
import urllib.request
from datetime import date, timedelta
from pathlib import Path


def download(url, attempts=3):
    error = None
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "InvestDashboard/1.0"})
            with urllib.request.urlopen(request, timeout=90) as response:
                return response.read().decode("utf-8")
        except Exception as exc:
            error = exc
            time.sleep(3 * (attempt + 1))
    raise error


def fred_series(series_id, start_date):
    url = "https://fred.stlouisfed.org/graph/fredgraph.csv?" + urllib.parse.urlencode(
        {"id": series_id, "cosd": start_date}
    )
    rows = []
    for row in csv.DictReader(io.StringIO(download(url))):
        raw = row.get(series_id, "")
        try:
            rows.append({"date": row["observation_date"], "value": float(raw)})
        except (KeyError, TypeError, ValueError):
            continue
    return rows


def tga_series(start_date):
    query = urllib.parse.urlencode(
        {
            "fields": "record_date,account_type,open_today_bal",
            "filter": f"record_date:gte:{start_date}",
            "sort": "record_date",
            "page[size]": "1000",
        }
    )
    url = "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/dts/operating_cash_balance?" + query
    payload = json.loads(download(url))
    rows = []
    for item in payload.get("data", []):
        if item.get("account_type") != "Treasury General Account (TGA) Closing Balance":
            continue
        try:
            rows.append({"date": item["record_date"], "value": float(item["open_today_bal"])})
        except (KeyError, TypeError, ValueError):
            continue
    return sorted(rows, key=lambda row: row["date"])


def last_value(rows, target_date):
    found = None
    for row in rows:
        if row["date"] > target_date:
            break
        found = row["value"]
    return found


start_date = (date.today() - timedelta(days=230)).isoformat()
walcl = fred_series("WALCL", start_date)
rrp = fred_series("RRPONTSYD", start_date)
reserves = fred_series("WRESBAL", start_date)
tga = tga_series(start_date)

combined = []
for row in walcl:
    tga_value = last_value(tga, row["date"])
    rrp_value = last_value(rrp, row["date"])
    reserves_value = last_value(reserves, row["date"])
    if tga_value is None or rrp_value is None or reserves_value is None:
        continue
    walcl_billions = row["value"] / 1000
    tga_billions = tga_value / 1000
    combined.append(
        {
            "date": row["date"],
            "value": round(walcl_billions - tga_billions - rrp_value, 3),
            "walcl": round(walcl_billions, 3),
            "tga": round(tga_billions, 3),
            "rrp": round(rrp_value, 3),
            "reserves": round(reserves_value, 3),
        }
    )

if len(combined) < 5:
    raise RuntimeError("Not enough combined liquidity observations")

output = Path(__file__).resolve().parent / "liquidity.json"
output.write_text(
    json.dumps({"updated_at": date.today().isoformat(), "rows": combined[-30:]}, indent=2),
    encoding="utf-8",
)
