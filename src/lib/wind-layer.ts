/** User choice is separate from a temporary route-preference override.
 * Neither the override nor its owner is written to persistent settings. */
export type WindLayerState = {
  manualVisible: boolean;
  autoShowFor: object | null;
};
export const initialWindLayer: WindLayerState = {
  manualVisible: false,
  autoShowFor: null,
};
type WindLayerAction =
  | { type: 'prefer'; owner: object }
  | { type: 'manual'; visible: boolean }
  | { type: 'end' };

export function reduceWindLayer(
  state: WindLayerState,
  action: WindLayerAction,
): WindLayerState {
  switch (action.type) {
    case 'prefer':
      return { ...state, autoShowFor: action.owner };
    case 'manual':
      // Even off then on relinquishes automatic ownership for this interval.
      return { manualVisible: action.visible, autoShowFor: null };
    case 'end':
      return state.autoShowFor ? { ...state, autoShowFor: null } : state;
  }
}

export function windLayerVisible(
  state: WindLayerState,
  activeOwner: object | null,
) {
  return (
    state.manualVisible ||
    (activeOwner !== null && state.autoShowFor === activeOwner)
  );
}
