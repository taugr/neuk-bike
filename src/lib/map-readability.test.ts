import { describe, expect, it } from 'vitest';
import type { StyleSpecification } from 'maplibre-gl';
import { improveDarkMapReadability } from './map-readability';

describe('dark map readability', () => {
  it('brightens navigation features while preserving path patterns and unrelated layers', () => {
    const style: StyleSpecification = {
      version: 8,
      sources: {},
      layers: [
        { id: 'background', type: 'background' },
        {
          id: 'highway_path',
          type: 'line',
          source: 'map',
          paint: { 'line-dasharray': [1.5, 1.5], 'line-width': 3 },
        },
        {
          id: 'highway_name_other',
          type: 'symbol',
          source: 'map',
          layout: { 'text-field': '{name}' },
        },
        {
          id: 'route',
          type: 'line',
          source: 'route',
          paint: { 'line-color': '#ff0000' },
        },
      ],
    };
    const result = improveDarkMapReadability(style);
    expect(result.layers[1].paint).toMatchObject({
      'line-color': '#a0b7a8',
      'line-dasharray': [1.5, 1.5],
      'line-width': 3,
    });
    expect(result.layers[2].paint).toMatchObject({
      'text-color': '#e2ebe5',
      'text-halo-color': '#17211f',
    });
    expect(result.layers[3]).toBe(style.layers[3]);
    expect(style.layers[1].paint).not.toHaveProperty('line-color');
  });
});
