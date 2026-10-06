import { useSyncExternalStore } from 'react';
const query = '(max-width: 767px)';
const subscribe = (notify: () => void) => {
  const media = window.matchMedia(query);
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
};
const getSnapshot = () => window.matchMedia(query).matches;
export function useMobile() { return useSyncExternalStore(subscribe, getSnapshot, () => false); }
