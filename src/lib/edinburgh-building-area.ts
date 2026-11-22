// Rounded outwards from the council boundary in the building manifest. Leave
// room for the neighbouring tiles and for the camera to tilt across the edge.
export function isNearEdinburghBuildings([longitude, latitude]: [
  number,
  number,
]) {
  return (
    longitude >= -3.5 &&
    longitude <= -3 &&
    latitude >= 55.78 &&
    latitude <= 56.05
  );
}
