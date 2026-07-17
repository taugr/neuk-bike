const geofabrikRoot = 'https://download.geofabrik.de';
const geofabrikAfricaRoot = `${geofabrikRoot}/africa`;
const geofabrikEuropeRoot = `${geofabrikRoot}/europe`;
const geofabrikSpainRoot = `${geofabrikEuropeRoot}/spain`;
const geofabrikUkRoot = `${geofabrikEuropeRoot}/united-kingdom`;

export const coverageLabel = 'UK, Ireland and Spain';

const englandRegions = [
  ['bedfordshire', 'Bedfordshire'],
  ['berkshire', 'Berkshire'],
  ['bristol', 'Bristol'],
  ['buckinghamshire', 'Buckinghamshire'],
  ['cambridgeshire', 'Cambridgeshire'],
  ['cheshire', 'Cheshire'],
  ['cornwall', 'Cornwall'],
  ['cumbria', 'Cumbria'],
  ['derbyshire', 'Derbyshire'],
  ['devon', 'Devon'],
  ['dorset', 'Dorset'],
  ['durham', 'Durham'],
  ['east-sussex', 'East Sussex'],
  ['east-yorkshire-with-hull', 'East Yorkshire with Hull'],
  ['essex', 'Essex'],
  ['gloucestershire', 'Gloucestershire'],
  ['greater-london', 'Greater London'],
  ['greater-manchester', 'Greater Manchester'],
  ['hampshire', 'Hampshire'],
  ['herefordshire', 'Herefordshire'],
  ['hertfordshire', 'Hertfordshire'],
  ['isle-of-wight', 'Isle of Wight'],
  ['kent', 'Kent'],
  ['lancashire', 'Lancashire'],
  ['leicestershire', 'Leicestershire'],
  ['lincolnshire', 'Lincolnshire'],
  ['merseyside', 'Merseyside'],
  ['norfolk', 'Norfolk'],
  ['north-yorkshire', 'North Yorkshire'],
  ['northamptonshire', 'Northamptonshire'],
  ['northumberland', 'Northumberland'],
  ['nottinghamshire', 'Nottinghamshire'],
  ['oxfordshire', 'Oxfordshire'],
  ['rutland', 'Rutland'],
  ['shropshire', 'Shropshire'],
  ['somerset', 'Somerset'],
  ['south-yorkshire', 'South Yorkshire'],
  ['staffordshire', 'Staffordshire'],
  ['suffolk', 'Suffolk'],
  ['surrey', 'Surrey'],
  ['tyne-and-wear', 'Tyne and Wear'],
  ['warwickshire', 'Warwickshire'],
  ['west-midlands', 'West Midlands'],
  ['west-sussex', 'West Sussex'],
  ['west-yorkshire', 'West Yorkshire'],
  ['wiltshire', 'Wiltshire'],
  ['worcestershire', 'Worcestershire'],
];

const spainRegions = [
  ['andalucia', 'Andalucía'],
  ['aragon', 'Aragón'],
  ['asturias', 'Asturias'],
  ['cantabria', 'Cantabria'],
  ['castilla-la-mancha', 'Castilla-La Mancha'],
  ['castilla-y-leon', 'Castilla y León'],
  ['cataluna', 'Cataluña'],
  ['ceuta', 'Ceuta'],
  ['extremadura', 'Extremadura'],
  ['galicia', 'Galicia'],
  ['islas-baleares', 'Islas Baleares'],
  ['la-rioja', 'La Rioja'],
  ['madrid', 'Madrid'],
  ['melilla', 'Melilla'],
  ['murcia', 'Murcia'],
  ['navarra', 'Navarra'],
  ['pais-vasco', 'País Vasco'],
  ['valencia', 'Valencia'],
];

export const osmInputs = [
  {
    countryId: 'scotland',
    id: 'scotland',
    label: 'Scotland',
    url: `${geofabrikUkRoot}/scotland-latest.osm.pbf`,
  },
  ...englandRegions.map(([id, label]) => ({
    countryId: 'england',
    id,
    label,
    url: `${geofabrikUkRoot}/england/${id}-latest.osm.pbf`,
  })),
  {
    countryId: 'wales',
    id: 'wales',
    label: 'Wales',
    url: `${geofabrikUkRoot}/wales-latest.osm.pbf`,
  },
  {
    countryId: 'ireland',
    id: 'ireland-and-northern-ireland',
    label: 'Ireland and Northern Ireland',
    url: `${geofabrikEuropeRoot}/ireland-and-northern-ireland-latest.osm.pbf`,
  },
  ...spainRegions.map(([id, label]) => ({
    countryId: 'spain',
    id: `spain-${id}`,
    label,
    url: `${geofabrikSpainRoot}/${id}-latest.osm.pbf`,
  })),
  {
    countryId: 'spain',
    id: 'canary-islands',
    label: 'Canary Islands',
    url: `${geofabrikAfricaRoot}/canary-islands-latest.osm.pbf`,
  },
];

export const coverageInputs = [
  {
    id: 'england',
    label: 'England',
    url: `${geofabrikUkRoot}/england.poly`,
  },
  {
    id: 'scotland',
    label: 'Scotland',
    url: `${geofabrikUkRoot}/scotland.poly`,
  },
  {
    id: 'wales',
    label: 'Wales',
    url: `${geofabrikUkRoot}/wales.poly`,
  },
  {
    id: 'ireland-and-northern-ireland',
    label: 'Ireland and Northern Ireland',
    url: `${geofabrikEuropeRoot}/ireland-and-northern-ireland.poly`,
  },
  {
    id: 'spain',
    label: 'Spain',
    url: `${geofabrikEuropeRoot}/spain.poly`,
  },
  {
    id: 'canary-islands',
    label: 'Canary Islands',
    url: `${geofabrikAfricaRoot}/canary-islands.poly`,
  },
];

export const osmCatalogueUrl = geofabrikRoot;
export const osmLicenceUrl = 'https://opendatacommons.org/licenses/odbl/1-0/';
