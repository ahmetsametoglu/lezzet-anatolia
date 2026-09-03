import { act, renderHook } from '@testing-library/react-native';

import { chooseActiveArea, resetActiveArea, useActiveAreaId } from './area-choice';

/*
  Aktif alan deposunun iki sözü: seçim bağlanan her ekrana ANINDA yansır (aynı oturumdaki iki
  ekran aynı cevabı okur) ve `null` meşru bir değerdir — "belirtilmedi", "yok" değil.
*/

beforeEach(() => resetActiveArea());

describe('area-choice', () => {
  it("seçim bağlanan her hook'a yansır; bırakma null döner", async () => {
    const first = await renderHook(() => useActiveAreaId());
    const second = await renderHook(() => useActiveAreaId());
    expect(first.result.current).toBeNull();

    await act(() => chooseActiveArea('area-1'));
    expect(first.result.current).toBe('area-1');
    expect(second.result.current).toBe('area-1');

    await act(() => chooseActiveArea(null));
    expect(first.result.current).toBeNull();
    expect(second.result.current).toBeNull();
  });
});
