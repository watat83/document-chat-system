import { useSyncExternalStore } from 'react';
const subscribe = (notify: () => void) => {
  window.addEventListener('resize', notify);
  return () => window.removeEventListener('resize', notify);
};
const getSnapshot = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;
export function useIsTouchDevice() { return useSyncExternalStore(subscribe, getSnapshot, () => false); }
