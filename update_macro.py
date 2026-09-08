"""Public FRED observations, fetched once for all dashboard visitors."""
import csv
import io
import json
import math
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

SERIES = ['DGS2', 'DGS10', 'DFII10', 'T10YIE', 'VIXCLS']

def parse_csv(text, series):
    result = []
    for row in csv.DictReader(io.StringIO(text)):
        try:
            value = float(row[series])
            day = row.get('observation_date') or row.get('DATE')
            date.fromisoformat(day)
            if math.isfinite(value):
                result.append({'date': day, 'value': value})
        except (ValueError, TypeError, KeyError):
            continue
    return sorted(result, key=lambda x: x['date'])

def main():
    path = Path(__file__).with_name('macro_data.json')
    old = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {'series': {}}
    output = {'version': 1, 'fetchedAt': datetime.now(timezone.utc).isoformat(), 'series': {}}
    successes = 0
    for series in SERIES:
        source = 'https://fred.stlouisfed.org/series/' + series
        try:
            url = 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=' + series + '&cosd=' + (date.today()-timedelta(days=550)).isoformat()
            with urllib.request.urlopen(url, timeout=45) as response:
                rows = parse_csv(response.read().decode('utf-8-sig'), series)
            if len(rows) < 30:
                raise ValueError('Insufficient observations')
            output['series'][series] = {'rows': rows, 'source': source, 'fetchedAt': output['fetchedAt'], 'failed': False}
            successes += 1
        except Exception:
            output['series'][series] = {**old['series'].get(series, {'rows': [], 'source': source}), 'failed': True}
            print('::warning::Unable to refresh ' + series)
    if not successes:
        raise RuntimeError('No series refreshed; previous file preserved')
    path.write_text(json.dumps(output, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print('Updated', successes, 'macro series')

if __name__ == '__main__':
    main()
