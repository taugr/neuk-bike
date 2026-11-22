export const edinburghOverviewMinZoom = 12;
export const edinburghOverviewFullZoom = 13;
export const edinburghCityOverviewMinZoom = 11;
export const edinburghCityOverviewFullZoom = 12;

export function isLocalAerialPreview(
  location:
    | Pick<Location, 'hostname' | 'search'>
    | undefined = typeof window === 'undefined' ? undefined : window.location,
) {
  return (
    !!location &&
    ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) &&
    new URLSearchParams(location.search).get('aerialPreview') === '1'
  );
}

export function isLocalLidarPreview() {
  return (
    isLocalAerialPreview() &&
    new URLSearchParams(window.location.search).get('lidar') !== '0'
  );
}

export function isLocalShadedBuildingsPreview() {
  return (
    isLocalLidarPreview() &&
    ['shaded', 'edinburgh', 'edinburgh-pilot'].includes(
      new URLSearchParams(window.location.search).get('buildings') ?? '',
    )
  );
}

export function isLocalEdinburghBuildingsPreview() {
  return (
    isLocalLidarPreview() &&
    new URLSearchParams(window.location.search).get('buildings') === 'edinburgh'
  );
}

export function isLocalEdinburghPilotPreview() {
  return (
    isLocalLidarPreview() &&
    new URLSearchParams(window.location.search).get('buildings') ===
      'edinburgh-pilot'
  );
}

export function isLocalPrincesStreetPreview() {
  return (
    isLocalLidarPreview() &&
    new URLSearchParams(window.location.search).get('facades') === 'princes'
  );
}

export function isLocalModeledFrontagePreview() {
  return (
    isLocalShadedBuildingsPreview() &&
    !isLocalEdinburghBuildingsPreview() &&
    !isLocalEdinburghPilotPreview() &&
    new URLSearchParams(window.location.search).get('facades') === 'model'
  );
}

export function localPrincesStreetRoofPreview() {
  if (!isLocalPrincesStreetPreview() || isLocalShadedBuildingsPreview()) return;
  const mode = new URLSearchParams(window.location.search).get('roofs');
  if (mode === 'photo' || mode === 'detail') return mode;
}
