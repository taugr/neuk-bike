/** Project a short step ahead so the cue follows both map rotation and tilt. */
export function getScreenHeading(
  position: readonly [latitude: number, longitude: number],
  heading: number,
  project: (coordinate: [longitude: number, latitude: number]) => {
    x: number;
    y: number;
  },
) {
  const [latitude, longitude] = position;
  const radians = (heading * Math.PI) / 180;
  const stepDegrees = 30 / 111_320;
  const start = project([longitude, latitude]);
  const ahead = project([
    longitude +
      (Math.sin(radians) * stepDegrees) / Math.cos((latitude * Math.PI) / 180),
    latitude + Math.cos(radians) * stepDegrees,
  ]);
  return (Math.atan2(ahead.x - start.x, start.y - ahead.y) * 180) / Math.PI;
}
