"""Reproduce the private 15 October station snapshot from captured raw files.
No network access. Usage: python3 research/wind-stations/prepare-snapshot.py RAW_DIR
The raw capture directory and SHA256 metadata are retained in local task evidence.
"""
import csv, gzip, hashlib, html, io, json, re, sys
from pathlib import Path
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

root = Path(sys.argv[1])
meta = json.loads((root / 'capture.json').read_text())
for name, item in meta.items():
    assert hashlib.sha256((root / name).read_bytes()).hexdigest() == item['sha256']
kt = 1852 / 3600
records = []

def utc(value):
    return value.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')

def source(name, label, rights, evidence):
    return {**meta[name], 'name': label, 'reuse': rights, 'evidenceUrl': evidence}

metar = json.loads((root / 'egph.json').read_text())[0]
records.append(dict(id='EGPH', name='Edinburgh Airport', point=[metar['lon'], metar['lat']],
    positionKind='reported station coordinate', positionUncertaintyM=0,
    exposure='Airport observation; sensor height and averaging details not verified.',
    observedAt=utc(datetime.fromtimestamp(metar['obsTime'], timezone.utc)), rawTime=metar['rawOb'], timezoneInferred=False,
    speed=metar['wspd'] * kt, direction=metar['wdir'], gust=metar.get('wgst', None),
    directionResolutionDegrees=10, originalSpeed=metar['wspd'], originalUnits='knots',
    raw=metar, source=source('egph.json','NOAA/NWS Aviation Weather Center',
    'NWS public-domain policy unless specifically marked otherwise; no endorsement claimed.', 'https://www.weather.gov/disclaimer')))
if records[-1]['gust'] is not None: records[-1]['gust'] *= kt

reader=csv.DictReader(io.StringIO(gzip.decompress((root/'jcmb.csv.gz').read_bytes()).decode()))
units=next(reader)
assert units['Wind Speed Ave']=='m/s' and units['Wind Dir Ave']=='Deg'
rows=list(reader); row=rows[-1]
records.append(dict(id='JCMB',name='JCMB roof',point=[-3.1743,55.9216],positionKind='building proxy; not surveyed sensor position',positionUncertaintyM=100,
    exposure='Rooftop station; height and exposure correction unknown. 100m is a modelling assumption, not an accuracy bound.',
    observedAt=utc(datetime.strptime(row['Date/Time'],'%Y-%m-%d %H:%M:%S').replace(tzinfo=ZoneInfo('Europe/London'))),rawTime=row['Date/Time'],timezoneInferred=True,
    timezoneNote='Raw CSV has no timezone. Europe/London/BST inferred for this date, not confirmed by the feed.',
    speed=float(row['Wind Speed Ave']),direction=float(row['Wind Dir Ave']),gust=float(row['Wind Speed Max']),directionResolutionDegrees=1,
    originalSpeed=float(row['Wind Speed Ave']),originalUnits='m/s',raw=row,
    coordinateSource='https://www.ph.ed.ac.uk/about/finding-us/james-clerk-maxwell-building-jcmb',
    source=source('jcmb.csv.gz','University of Edinburgh GeoSciences / Hugh Pumphrey',
    'No explicit restriction found on the raw archive; blog copyright applicability unclear. Open licence/commercial clearance not established.', 'https://blogs.ed.ac.uk/hughpumphrey/current-weather/')))

page=(root/'ports.html').read_text()
compass={name:i*22.5 for i,name in enumerate('N NNE NE ENE E ESE SE SSE S SSW SW WSW W WNW NW NNW'.split())}
def cell(site,param):
    td=re.search(r'<td\s+Site="'+site+r'" Dataset="5" Parameter="'+param+r'".*?</td>',page,re.S|re.I)
    if not td: raise ValueError('Missing port parameter')
    span=re.search(r'<span title="(.*?)">(.*?)</span>',td.group(),re.S)
    details=html.unescape(span.group(1)); display=html.unescape(re.sub('<[^>]+>','',span.group(2))).strip()
    stamp=re.search(r'DateTime: ([\d-]+ [\d:]+) UTC',details).group(1)
    return {'display':display,'observedAt':stamp.replace(' ','T')+'Z','details':details}
for site,name,point in [('1931','Leith port',[-3.1718402,55.9798009]),('1921','Rosyth port',[-3.4401603,56.0238586])]:
    direction,speed,gust=[cell(site,p) for p in ['50003','50002','50006']]
    assert direction['observedAt']==speed['observedAt']==gust['observedAt']
    records.append(dict(id=site,name=name,point=point,positionKind='port contact-map proxy; sensor position unknown',positionUncertaintyM=2000,
        exposure='Marine/port exposure; sensor height unknown. 2km proxy uncertainty is a modelling assumption, not an accuracy bound.',
        observedAt=speed['observedAt'],rawTime=speed['observedAt'],timezoneInferred=False,
        speed=float(speed['display'])*kt,direction=compass.get(direction['display'],None),gust=float(gust['display'])*kt,
        directionResolutionDegrees=22.5,originalSpeed=float(speed['display']),originalUnits='knots',raw={'direction':direction,'sustained':speed,'gust':gust},
        coordinateSource='https://forthports.co.uk/contacts/',
        source=source('ports.html','Forth Ports / Port-Log',
        'Public anonymous display; no explicit reuse prohibition found. Open licence/commercial clearance not established. Displayed speeds are knots; tooltip Value is not used.', 'https://forthports.port-log.net/live/Display.php')))
snapshot={'version':1,'kind':'station-snapshot','capturedAt':max(x['capturedAt'] for x in meta.values()),
    'coverage':{'west':-3.6,'east':-2.95,'south':55.8,'north':56.15},
    'method':'Experimental regional vector blend: tapered inverse squared distance, 20km support, nearest station within10km, at least2 readings, max age90min at capture. Not validated street wind.',
    'excludedSources':['Weather Underground (derivative restrictions)','Met Office webpage (automated scraping restriction)','Forth Bridges (copying restriction)','Port feeds1966/1967 (sensor positions unresolved)'],
    'stations':records}
out=Path(__file__).with_name('edinburgh-stations-2026-10-15.json');out.write_text(json.dumps(snapshot,indent=2)+'\n')
print(json.dumps([{'id':x['id'],'observedAt':x['observedAt'],'speed':x['speed'],'direction':x['direction']} for x in records],indent=2))
