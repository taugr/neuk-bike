"""Offline comparison of the captured UKV response and city baseline; no requests.
Usage: python3 scripts/compare-provider-wind.py [captured_fixture.json]
Outputs JSON to stdout. Fixture preserves original values, request URLs and hashes.
"""
import json, math, sys
from pathlib import Path
path=Path(sys.argv[1]) if len(sys.argv)>1 else Path('src/lib/fixtures/ukv-edinburgh-2026-10-15.json')
capture=json.loads(path.read_text()); regional=capture['grid'][:20]; controls=capture['grid'][20:]; baseline=capture['baseline']
assert len(regional)==20 and len({(r['latitude'],r['longitude']) for r in regional})==20
assert all((r['latitude'],r['longitude'],r['hourly'])==(baseline['latitude'],baseline['longitude'],baseline['hourly']) for r in controls)
def distance(a,b):
 return 6371000*math.hypot(math.radians(a['latitude']-b['latitude']),math.radians(a['longitude']-b['longitude'])*math.cos(math.radians((a['latitude']+b['latitude'])/2)))
edges=[distance(regional[i],regional[i+1]) for i in range(20) if i%5<4]+[distance(regional[i],regional[i+5]) for i in range(15)]
hours=[]
for hour in ['2026-10-15T19:00','2026-10-15T20:00','2026-10-15T21:00','2026-10-15T22:00']:
 rows=[]
 for i,r in enumerate(regional):
  t=r['hourly']['time'].index(hour)
  speed=r['hourly']['wind_speed_10m'][t];direction=r['hourly']['wind_direction_10m'][t]
  rows.append({'requestedLatLng':capture['provenance']['grid']['requestedPoints'][i], 'returnedLatLng':[r['latitude'],r['longitude']],'speedMs':speed,'fromDegrees':direction,'eastwardAirMs':-speed*math.sin(math.radians(direction)),'northwardAirMs':-speed*math.cos(math.radians(direction))})
 t=baseline['hourly']['time'].index(hour)
 hours.append({'validAt':hour+'Z','baseline':{'speedMs':baseline['hourly']['wind_speed_10m'][t],'fromDegrees':baseline['hourly']['wind_direction_10m'][t]},'regionalSpeedRangeMs':[min(r['speedMs'] for r in rows),max(r['speedMs'] for r in rows)],'regionalFromRangeDegrees':[min(r['fromDegrees'] for r in rows),max(r['fromDegrees'] for r in rows)],'cells':rows})
print(json.dumps({'model':'ukmo_uk_deterministic_2km','nativeResolutionM':2000,'sampleCount':20,'distinctCellCount':20,'duplicateControlCount':3,'controlsMatchBaseline':True,'actualSampleEdgeRangeM':[min(edges),max(edges)],'provenance':capture['provenance'],'hours':hours,'limitations':['Regional variation is not a forecast skill assessment.','Application samples are coarser than the native model. The interpolated city value need not equal the independently queried city cell.','Forecast API supplies no run-initialisation timestamp; capture time is not model age.','No station assimilation, personal stations, terrain downscaling or street shelter model.']},indent=2))
