import unittest
import update_liquidity as u

class LiquidityTests(unittest.TestCase):
    def test_parse_invalid_and_zero(self):
        self.assertEqual(u.clean([{'date':'2026-09-09','value':'0'}, {'date':'bad','value':1}, {'date':'2026-09-10','value':'nan'}]),[{'date':'2026-09-09','value':0.0}])
    def test_weekly_alignment_units_and_stale_daily(self):
        data={key:{'rows':rows} for key,rows in {
            'WALCL':[{'date':'2026-09-09','value':6740000}],
            'WRESBAL':[{'date':'2026-09-09','value':2991000}],
            'TGA':[{'date':'2026-09-09','value':800000},{'date':'2026-09-15','value':900000}],
            'RRPONTSYD':[{'date':'2026-09-09','value':5}]
        }.items()}
        row=u.combine(data)[0]
        self.assertEqual(row['value'],5935)
        self.assertEqual(row['reserves'],2991000)
        self.assertEqual(row['sourceDates']['tga'],'2026-09-09')
        data['TGA']['rows']=[{'date':'2026-09-01','value':800000}]
        self.assertEqual(u.combine(data),[])
    def test_missing_weekly_cannot_be_forward_filled(self):
        data={key:{'rows':[{'date':day,'value':1}]} for key,day in [('WALCL','2026-09-09'),('WRESBAL','2026-09-02'),('TGA','2026-09-09'),('RRPONTSYD','2026-09-09')]}
        self.assertEqual(u.combine(data),[])

if __name__=='__main__':unittest.main()
