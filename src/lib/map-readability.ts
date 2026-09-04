import type { StyleSpecification } from 'maplibre-gl';

/** Improve orientation without changing source data, zoom rules or route overlays. */
export function improveDarkMapReadability(
  style: StyleSpecification,
): StyleSpecification {
  return {
    ...style,
    layers: style.layers.map((layer) => {
      if (layer.type === 'background') {
        return {
          ...layer,
          paint: { ...layer.paint, 'background-color': '#17211f' },
        };
      }
      if (layer.type === 'line' && /^(highway_|road_pier)/.test(layer.id)) {
        const color = layer.id.includes('path')
          ? '#a0b7a8'
          : layer.id.includes('casing')
            ? '#344b44'
            : '#71877e';
        return { ...layer, paint: { ...layer.paint, 'line-color': color } };
      }
      if (layer.type === 'symbol' && layer.layout?.['text-field']) {
        return {
          ...layer,
          paint: {
            ...layer.paint,
            'text-color': '#e2ebe5',
            'text-halo-color': '#17211f',
            'text-halo-width': 1.5,
            'text-halo-blur': 0,
          },
        };
      }
      return layer;
    }),
  };
}
