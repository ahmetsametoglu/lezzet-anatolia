import { act, renderHook, waitFor } from '@testing-library/react-native';

import { suggestAddressOptions, type AddressOption } from '@/lib/api/addresses';

import { useAddressLookup } from './use-address-lookup.hook';

jest.mock('@/lib/api/addresses', () => ({ suggestAddressOptions: jest.fn() }));

/*
  Öneri çekirdeğinin (`@lezzet/address/react`) kararları tek kapılı adres araması üzerinden sınanır: uç taklit, kanca ve
  çekirdek gerçek. Önbellek modül düzeyinde yaşadığı için her vaka kendi sorgu metinlerini kullanır.
*/

const mocked = jest.mocked(suggestAddressOptions);
type SuggestResult = Awaited<ReturnType<typeof suggestAddressOptions>>;

const option = (id: string): AddressOption => ({ id, title: `Adres ${id}`, subtitle: null, address: null });
const ok = (options: AddressOption[], busy = false): SuggestResult => ({ data: { options, busy }, error: null, status: 200, retryAfterSec: null });
const ids = (options: AddressOption[]) => options.map((o) => o.id);
const OPTIONS = { country: 'FR' as const, enabled: true, sessionToken: 'jeton', locale: 'fr' as const, debounceMs: 0 };

/** Bekleyen gecikme ve cevaplar işlensin; sayım ondan sonra yapılır. */
const settle = () => act(async () => new Promise<void>((done) => setTimeout(done, 20)));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => mocked.mockReset());

it('geç dönen cevap yeni sorgunun önerilerini ezmez', async () => {
  const slow = deferred<SuggestResult>();
  const fast = deferred<SuggestResult>();
  mocked.mockImplementation(({ query }) => (query === 'yarış 1' ? slow.promise : fast.promise));

  const { result, rerender } = await renderHook((query: string) => useAddressLookup(query, OPTIONS), { initialProps: 'yarış 1' });
  await waitFor(() => expect(mocked).toHaveBeenCalledTimes(1));
  await rerender('yarış 12');
  await waitFor(() => expect(mocked).toHaveBeenCalledTimes(2));

  await act(async () => {
    fast.resolve(ok([option('yeni')]));
    await fast.promise;
  });
  await act(async () => {
    slow.resolve(ok([option('eski')]));
    await slow.promise;
  });

  expect(ids(result.current.options)).toEqual(['yeni']);
});

it('yalnız başarılı cevap hatırlanır: başarılı sorgu yeniden sorulmaz, kota cevabı alan sorgu yeniden sorulur', async () => {
  mocked.mockImplementation(({ query }) => Promise.resolve(query === 'hafıza 1' ? ok([option('bulundu')]) : ok([], true)));

  const { result, rerender } = await renderHook((query: string) => useAddressLookup(query, OPTIONS), { initialProps: 'hafıza 1' });
  await waitFor(() => expect(ids(result.current.options)).toEqual(['bulundu']));
  await rerender('hafıza 12');
  await waitFor(() => expect(result.current.busy).toBe(true));

  await rerender('hafıza 1');
  await settle();
  expect(mocked).toHaveBeenCalledTimes(2);

  await rerender('hafıza 12');
  await waitFor(() => expect(mocked).toHaveBeenCalledTimes(3));
  expect(mocked.mock.calls.map(([input]) => input.query)).toEqual(['hafıza 1', 'hafıza 12', 'hafıza 12']);
});

it('istek fırlayınca önceki sorgunun adayları ekranda kalmaz', async () => {
  mocked.mockImplementation(({ query }) => (query === 'düşen 1' ? Promise.resolve(ok([option('önceki')])) : Promise.reject(new Error('ağ'))));

  const { result, rerender } = await renderHook((query: string) => useAddressLookup(query, OPTIONS), { initialProps: 'düşen 1' });
  await waitFor(() => expect(ids(result.current.options)).toEqual(['önceki']));
  await rerender('düşen 12');
  await waitFor(() => expect(mocked).toHaveBeenCalledTimes(2));

  await waitFor(() => expect(result.current.options).toEqual([]));
});
