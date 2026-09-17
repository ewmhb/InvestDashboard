"""One shared, dated source for daily liquidity and the weekly dashboard signal."""
import json
import math
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TGA_SOURCE = 'https://fiscaldata.treasury.gov/datasets/daily-treasury-statement/operating-cash-balance'

def clean(rows):
    result = {}
    for row in rows:
        try:
            day = date.fromisoformat(row['date']).isoformat()
            value = float(str(row['value']).replace(',', ''))
            if math.isfinite(value):
                result[day] = {'date': day, 'value': value}
        except (ValueError, KeyError, TypeError):
            continue
    return sorted(result.values(), key=lambda x: x['date'])

def download_tga():
    rows = []
    for page in range(1, 20):
        query = urllib.parse.urlencode({'fields': 'record_date,account_type,open_today_bal',
            'filter': 'record_date:gte:' + (date.today()-timedelta(days=550)).isoformat(),
            'sort': 'record_date', 'page[size]': '1000', 'page[number]': str(page)})
        url = 'https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/dts/operating_cash_balance?' + query
        with urllib.request.urlopen(url, timeout=45) as response:
            payload = json.load(response)
        rows.extend({'date': r['record_date'], 'value': r['open_today_bal']} for r in payload['data']
                    if r['account_type'] == 'Treasury General Account (TGA) Closing Balance')
        if page >= int(payload['meta']['total-pages']):
            break
    else:
        raise ValueError('Incomplete TGA pagination')
    rows = clean(rows)
    if len(rows) < 30:
        raise ValueError('Insufficient TGA observations')
    return rows

def at_or_before(rows, day, tolerance=4):
    found = next((r for r in reversed(rows) if r['date'] <= day), None)
    if found and (date.fromisoformat(day)-date.fromisoformat(found['date'])).days <= tolerance:
        return found

def combine(series):
    result = []
    reserves = {r['date']: r for r in series['WRESBAL']['rows']}
    for asset in series['WALCL']['rows']:
        day = asset['date']
        reserve = reserves.get(day)
        tga = at_or_before(series['TGA']['rows'], day)
        rrp = at_or_before(series['RRPONTSYD']['rows'], day)
        if not all([reserve, tga, rrp]):
            continue
        result.append({'date': day, 'value': round(asset['value']/1000-tga['value']/1000-rrp['value'], 3),
            'walcl': asset['value']/1000, 'tga': tga['value']/1000, 'rrp': rrp['value'],
            'reserves': reserve['value'], 'sourceDates': {'tga': tga['date'], 'rrp': rrp['date'], 'reserves': reserve['date']}})
    return result[-60:]

def main():
    macro = json.loads((ROOT/'macro_data.json').read_text(encoding='utf-8-sig'))
    old = json.loads((ROOT/'liquidity.json').read_text(encoding='utf-8-sig')) if (ROOT/'liquidity.json').exists() else {}
    now = datetime.now(timezone.utc).isoformat()
    series = {key: {**macro['series'][key], 'rows': clean(macro['series'][key]['rows'])}
              for key in ['WALCL', 'WRESBAL', 'RRPONTSYD']}
    failed = []
    try:
        series['TGA'] = {'rows': download_tga(), 'source': TGA_SOURCE, 'fetchedAt': now, 'failed': False}
    except Exception as error:
        series['TGA'] = {**old.get('series', {}).get('TGA', {'rows': [], 'source': TGA_SOURCE}), 'failed': True}
        failed.append('TGA: ' + str(error))
    for key in ['WALCL', 'WRESBAL', 'RRPONTSYD']:
        checked = series[key].get('fetchedAt')
        if series[key].get('failed') or not checked or (datetime.now(timezone.utc)-datetime.fromisoformat(checked)).total_seconds() > 36*3600:
            series[key]['failed'] = True
            failed.append(key + ': collection failed or over 36 hours old')
    for key, item in series.items():
        item['frequency'] = 'daily' if key in ['TGA', 'RRPONTSYD'] else 'weekly'
    combined = combine(series)
    output = {'version': 2, 'updated_at': now, 'series': series, 'rows': combined, 'failed': bool(failed)}
    # Preserve the previous weekly data if an upstream source is unavailable, with explicit failure metadata.
    if len(combined) < 6:
        output['rows'] = old.get('rows', [])
        output['failed'] = True
        failed.append('Insufficient weekly coverage')
    (ROOT/'liquidity.json').write_text(json.dumps(output, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(json.dumps({'latest': {k: v['rows'][-1]['date'] if v['rows'] else None for k, v in series.items()},
                      'weekly': output['rows'][-1]['date'] if output['rows'] else None, 'errors': failed}))
    if failed:
        raise RuntimeError('; '.join(failed))

if __name__ == '__main__':
    main()
