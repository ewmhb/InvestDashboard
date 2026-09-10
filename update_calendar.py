"""Daily official economic calendar; failed sources retain last verified dates."""
import json
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

BLS = 'https://www.bls.gov/schedule/news_release/bls.ics'
FED = 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'
MONTHS = {m: i for i, m in enumerate(['January','February','March','April','May','June','July','August','September','October','November','December'], 1)}

def download(url):
    req = urllib.request.Request(url, headers={'User-Agent':'InvestDashboard calendar (+https://ewmhb.github.io/InvestDashboard/)'})
    with urllib.request.urlopen(req, timeout=30) as response:
        return response.read().decode('utf-8-sig')

def parse_bls(text):
    events = []
    text = re.sub(r'\r?\n[ \t]', '', text)
    labels = {'Consumer Price Index':'CPI 소비자물가', 'Producer Price Index':'PPI 생산자물가', 'Employment Situation':'고용보고서', 'Job Openings and Labor Turnover':'JOLTS 구인·이직'}
    for block in text.split('BEGIN:VEVENT')[1:]:
        title = re.search(r'^SUMMARY:(.+)', block, re.M)
        start = re.search(r'^DTSTART([^:]*):([0-9T]+)(Z?)', block, re.M)
        if not title or not start:
            continue
        label = next((v for k,v in labels.items() if k.lower() in title[1].lower()), None)
        if not label or len(start[2]) != 15:
            continue
        zone = timezone.utc if start[3] else ZoneInfo('America/New_York')
        at = datetime.strptime(start[2], '%Y%m%dT%H%M%S').replace(tzinfo=zone)
        events.append({'title':label, 'at':at.isoformat(), 'source':BLS, 'provider':'BLS', 'importance':'높음' if label!='JOLTS 구인·이직' else '중간'})
    if not events:
        raise ValueError('No BLS events parsed')
    return events

def parse_fed(text):
    events = []
    sections = re.split(r'(\d{4}) FOMC Meetings', text)
    for i in range(1, len(sections), 2):
        year = int(sections[i])
        for month, days in re.findall(r'fomc-meeting__month[^>]*>\s*<strong>([^<]+)</strong>.*?fomc-meeting__date[^>]*>([^<]+)', sections[i+1], re.S):
            month = month.strip().split('/')[-1]
            nums = re.findall(r'\d+', days)
            if month not in MONTHS or not nums:
                continue
            at = datetime(year, MONTHS[month], int(nums[-1]), 14, tzinfo=ZoneInfo('America/New_York'))
            events.append({'title':'FOMC 금리 결정'+(' · 경제전망' if '*' in days else ''), 'at':at.isoformat(), 'source':FED, 'provider':'FED', 'importance':'높음'})
    if not events:
        raise ValueError('No FOMC meetings parsed')
    return events

def main():
    path = Path(__file__).with_name('economic_calendar.json')
    result = json.loads(path.read_text(encoding='utf-8')) if path.exists() else {'events':[], 'sources':{}}
    stamp = datetime.now(timezone.utc).isoformat()
    for provider, url, parser in [('BLS',BLS,parse_bls),('FED',FED,parse_fed)]:
        try:
            events = parser(download(url))
            result['events'] = [e for e in result['events'] if e['provider'] != provider] + events
            result['sources'][provider] = {'checkedAt':stamp, 'failed':False}
        except Exception as exc:
            result['sources'][provider] = {**result['sources'].get(provider, {}), 'failed':True, 'attemptedAt':stamp}
            print('::warning::Calendar source failed:', provider, type(exc).__name__)
    result['events'].sort(key=lambda e:e['at'])
    path.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')

if __name__=='__main__':
    main()
