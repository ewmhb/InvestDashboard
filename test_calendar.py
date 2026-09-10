import unittest
from update_calendar import parse_bls, parse_fed

class CalendarTests(unittest.TestCase):
    def test_bls_timezone(self):
        rows = parse_bls('BEGIN:VEVENT\nSUMMARY:Consumer Price Index\nDTSTART;TZID=America/New_York:20260911T083000\nEND:VEVENT')
        self.assertEqual(rows[0]['at'],'2026-09-11T08:30:00-04:00')
        rows = parse_bls('BEGIN:VEVENT\nSUMMARY:Consumer Price Index\nDTSTART:20261110T133000Z\nEND:VEVENT')
        self.assertEqual(rows[0]['at'],'2026-11-10T13:30:00+00:00')
    def test_fed(self):
        html='2026 FOMC Meetings <div class="fomc-meeting__month"><strong>September</strong></div><div class="fomc-meeting__date">15-16*</div>'
        self.assertEqual(parse_fed(html)[0]['at'],'2026-09-16T14:00:00-04:00')
    def test_bad_data(self):
        for parser in [parse_bls,parse_fed]:
            with self.assertRaises(ValueError): parser('Access denied')

if __name__=='__main__': unittest.main()
