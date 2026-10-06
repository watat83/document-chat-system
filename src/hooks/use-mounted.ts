import { useSyncExternalStore } from 'react';
const subscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;
export function useMounted() {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}
