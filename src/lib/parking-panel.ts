import type { ParkingView } from '@/lib/map-pins';

export type ParkingPanelView = 'details' | 'directions' | 'list';
export type ParkingPanelReturnView = Exclude<ParkingPanelView, 'directions'>;
export type ParkingPanelTransition = 'navigate' | 'replace';
export type ParkingSelectionOrigin = 'list' | 'map';

export type ParkingPanelState = {
  detailsOrigin: ParkingSelectionOrigin;
  direction: -1 | 0 | 1;
  listContext: ParkingView;
  returnView: ParkingPanelReturnView;
  selectedId: string | null;
  transition: ParkingPanelTransition;
  view: ParkingPanelView;
};

export type ParkingPanelEvent =
  | { type: 'CLEAR_SELECTION' }
  | { type: 'CLOSE_DETAILS' }
  | { type: 'EXIT_DIRECTIONS' }
  | { selectedId: string | null; type: 'INITIALIZE_SELECTION' }
  | {
      origin: ParkingSelectionOrigin;
      selectedId: string;
      type: 'OPEN_DETAILS';
    }
  | { selectedId: string; type: 'OPEN_DIRECTIONS' }
  | { selectedId: string; type: 'SELECT_LIST_POINT' }
  | { selectedId: string | null; type: 'SHOW_NEARBY' }
  | { selectedId: string | null; type: 'SHOW_SAVED' }
  | { selectedId: string | null; type: 'RESET_LIST' }
  | { type: 'RESTORE_DESKTOP_LIST' };

export const initialParkingPanelState: ParkingPanelState = {
  detailsOrigin: 'map',
  direction: 1,
  listContext: 'nearby',
  returnView: 'list',
  selectedId: null,
  transition: 'navigate',
  view: 'list',
};

export function reduceParkingPanel(
  state: ParkingPanelState,
  event: ParkingPanelEvent,
): ParkingPanelState {
  switch (event.type) {
    case 'CLEAR_SELECTION':
      return {
        ...state,
        direction: -1,
        returnView: 'list',
        selectedId: null,
        transition: 'replace',
        view: 'list',
      };
    case 'CLOSE_DETAILS':
      return {
        ...state,
        direction: -1,
        returnView: 'list',
        transition: 'navigate',
        view: 'list',
      };
    case 'EXIT_DIRECTIONS':
      return {
        ...state,
        direction: -1,
        transition: 'navigate',
        view: state.returnView,
      };
    case 'INITIALIZE_SELECTION':
    case 'RESET_LIST':
      return {
        ...state,
        direction: -1,
        returnView: 'list',
        selectedId: event.selectedId,
        transition: 'replace',
        view: 'list',
      };
    case 'OPEN_DETAILS':
      return {
        ...state,
        detailsOrigin: event.origin,
        direction: event.origin === 'map' ? 0 : 1,
        returnView: 'details',
        selectedId: event.selectedId,
        transition: event.origin === 'map' ? 'replace' : 'navigate',
        view: 'details',
      };
    case 'OPEN_DIRECTIONS':
      return {
        ...state,
        direction: 1,
        returnView: state.view === 'directions' ? state.returnView : state.view,
        selectedId: event.selectedId,
        transition: 'navigate',
        view: 'directions',
      };
    case 'RESTORE_DESKTOP_LIST':
      return state.view === 'details'
        ? {
            ...state,
            direction: -1,
            returnView: 'list',
            transition: 'replace',
            view: 'list',
          }
        : state;
    case 'SELECT_LIST_POINT':
      return {
        ...state,
        direction: 0,
        returnView: 'list',
        selectedId: event.selectedId,
        transition: 'replace',
        view: 'list',
      };
    case 'SHOW_NEARBY':
      return {
        ...state,
        direction: -1,
        listContext: 'nearby',
        returnView: 'list',
        selectedId: event.selectedId,
        transition: 'navigate',
        view: 'list',
      };
    case 'SHOW_SAVED':
      return {
        ...state,
        direction: 1,
        listContext: 'saved',
        returnView: 'list',
        selectedId: event.selectedId,
        transition: 'navigate',
        view: 'list',
      };
  }
}
