/** @jest-environment jsdom */
import { renderHook } from '@testing-library/react';
import { useObjectURL } from '@/hooks/use-object-url';

const create = jest.fn();
const revoke = jest.fn();
beforeEach(() => {
  create.mockReset().mockImplementation(() => `blob:test-${create.mock.calls.length}`);
  revoke.mockReset();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
});
test('keeps a shared blob URL alive until the last consumer unmounts', () => {
  const blob = new Blob(['image']);
  const first = renderHook(() => useObjectURL(blob));
  const second = renderHook(() => useObjectURL(blob));
  expect(first.result.current).toBe(second.result.current);
  expect(create).toHaveBeenCalledTimes(1);
  first.unmount();
  expect(revoke).not.toHaveBeenCalled();
  second.unmount();
  expect(revoke).toHaveBeenCalledWith('blob:test-1');
});
test('replaces and releases URLs when the file changes', () => {
  const first = new Blob(['first']);
  const second = new Blob(['second']);
  const { result, rerender, unmount } = renderHook(({ blob }) => useObjectURL(blob), { initialProps: { blob: first as Blob | null } });
  rerender({ blob: second });
  expect(revoke).toHaveBeenCalledWith('blob:test-1');
  expect(result.current).toBe('blob:test-2');
  rerender({ blob: null });
  expect(result.current).toBeNull();
  expect(revoke).toHaveBeenCalledWith('blob:test-2');
  unmount();
  expect(revoke).toHaveBeenCalledTimes(2);
});
