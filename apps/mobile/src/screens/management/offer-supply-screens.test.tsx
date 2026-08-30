import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { OperationsSessionProvider } from '@/screens/operations/sections-context';
import type { OfferCandidatesResponse, SupplyResponse } from '@lezzet/types';
import { OfferApprovalScreen } from './offer-approval-screen';
import { SupplySuggestionScreen } from './supply-suggestion-screen';
import { managementCopy } from './copy';

/*
  Y3 (TEKLİF ONAYI) + Y4 (TEDARİK) EKRAN TESTLERİ (21.12 Dilim B) — ağ FETCH seviyesinde sahte,
  cevaplar sözleşme şeklinde. Çivilenen kararlar:

  · Çıkarılan satır İSTEĞE GİRMEZ; gövde yalnız "listede duran + okunabilir fiyatlı" satırları taşır
    ve fiyat operatörün SON yazdığıdır (öneri değil).
  · Açılamayan partinin akıbeti SATIRINDA görünür (`must_discard`) — toplu hataya indirgenmez.
  · Tedarik onayı kalem listesi GÖNDERMEZ — gövde yalnız grup kimliğidir (depo + tedarikçi).
  · `no_suggestion` hata değil "ekran bayattı"dır: etiket değişir ve liste yeniden okunur.
  · Eşlenmemiş grup CTA ÇİZMEZ — basılınca hiçbir şey yapmayan düğme olmaz (ölü buton yasağı).
*/

jest.mock('expo-router', () => {
  const react = jest.requireActual<{ useEffect: (effect: () => void, deps: unknown[]) => void }>('react');
  return {
    useRouter: () => ({ navigate: jest.fn(), back: jest.fn() }),
    useFocusEffect: (callback: () => void) => react.useEffect(callback, [callback]),
  };
});

const mockSession = { access_token: 'test-token' };
jest.mock('@/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: mockSession } }),
      refreshSession: async () => ({ data: { session: mockSession }, error: null }),
    },
  }),
}));

const t = managementCopy;
const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

function ok(data: unknown): Response {
  return { status: 200, headers: { get: () => null }, json: async () => ({ data, error: null }) } as unknown as Response;
}

const STOCK_A = '00000000-0000-4000-8000-00000000000a';
const STOCK_B = '00000000-0000-4000-8000-00000000000b';
const WAREHOUSE = '00000000-0000-4000-8000-0000000000aa';
const SUPPLIER = '00000000-0000-4000-8000-0000000000bb';
const VARIANT_1 = '00000000-0000-4000-8000-0000000000c1';
const VARIANT_2 = '00000000-0000-4000-8000-0000000000c2';
const VARIANT_3 = '00000000-0000-4000-8000-0000000000c3';

function candidates(): OfferCandidatesResponse {
  return {
    candidates: [
      {
        stockId: STOCK_A,
        title: 'Su Böreği · tepsi',
        lotNumber: 'P-0698',
        qty: 6,
        daysLeft: 2,
        /* Tasarımın kendi partisi (v3:30 — "Kalan ömür 2 gün · %18"). */
        remainingPercent: 18,
        listPriceCents: 1400,
        suggestedCents: 990,
        offerDiscountPercent: 30,
        warehouse: { code: 'STR', name: 'Strasbourg' },
      },
      {
        stockId: STOCK_B,
        title: 'Şöbiyet · 500 g',
        lotNumber: null,
        qty: 9,
        daysLeft: 5,
        /* Raf ömrü tanımsız ürün — yüzde ÖLÇÜLEMEZ, `null` gelir (sıfır değil). */
        remainingPercent: null,
        listPriceCents: null,
        suggestedCents: null,
        offerDiscountPercent: 30,
        warehouse: null,
      },
    ],
  };
}

function supplyGroups(): SupplyResponse {
  return {
    groups: [
      {
        supplierId: SUPPLIER,
        supplierName: 'Gaziantep Gıda',
        warehouseId: WAREHOUSE,
        warehouseCode: 'STR',
        lines: [
          {
            variantId: VARIANT_1,
            title: 'Fıstıklı Baklava (1 kg)',
            availableQty: 6,
            minStockQty: 20,
            suggestedQty: 24,
            incomingQty: 0,
            lastPurchaseCents: 2140,
            elsewhere: [{ warehouseCode: 'KEHL', qty: 14 }],
          },
          {
            // Son alışı bilinmeyen kalem — satırın "—" yolunu ölçmek için (sıfır gibi okutulmaz).
            variantId: VARIANT_3,
            title: 'Şöbiyet (500 g)',
            availableQty: 3,
            minStockQty: 10,
            suggestedQty: 6,
            incomingQty: 12,
            lastPurchaseCents: null,
            elsewhere: [],
          },
        ],
      },
      {
        supplierId: null,
        supplierName: null,
        warehouseId: WAREHOUSE,
        warehouseCode: 'STR',
        lines: [
          {
            variantId: VARIANT_2,
            title: 'Acılı Ezme (250 g)',
            availableQty: 4,
            minStockQty: 12,
            suggestedQty: 8,
            incomingQty: 0,
            lastPurchaseCents: null,
            elsewhere: [],
          },
        ],
      },
    ],
  };
}

async function renderScreen(node: React.ReactElement, loadingTestId: string) {
  await render(
    <OperationsSessionProvider
      value={{
        sections: ['management'],
        userName: 'Selim A.',
        userEmail: 'selim@lezzetanatolia.fr',
        warehouses: [],
        resolvedWarehouseId: null,
      }}
    >
      {node}
    </OperationsSessionProvider>,
  );
  await waitFor(() => expect(screen.queryByTestId(loadingTestId)).toBeNull());
}

/** Son POST çağrısının gövdesi — iddialar isteğin KENDİSİNE bakar, ekrandaki yankısına değil. */
function lastPostBody(): unknown {
  const post = [...fetchMock.mock.calls].reverse().find(([, init]) => init?.method === 'POST');
  expect(post).toBeDefined();
  return JSON.parse(String(post![1]!.body));
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
});

describe('Y3 · teklif onayı', () => {
  it('çıkarılan satır isteğe girmez; fiyat operatörün son yazdığıdır', async () => {
    fetchMock.mockImplementation((url, init) => {
      if (init?.method === 'POST') return Promise.resolve(ok({ results: [{ stockId: STOCK_A, status: 'ok' }] }));
      return Promise.resolve(ok(candidates()));
    });

    await renderScreen(<OfferApprovalScreen />, 'management-offer-loading');

    // B'ye önce OKUNABİLİR bir fiyat yazılır, SONRA listeden çıkarılır: iddia yalnız "fiyatsız
    // gitmez"e değil, "çıkarılan gitmez"e de basar (ilk hâli fiyatsız B ile sahte yeşildi —
    // sabotaj süzgeci kaldırınca test yine geçiyordu, 21.111 dersinin üçüncü tekrarı).
    await fireEvent.changeText(screen.getByTestId(`management-offer-price-${STOCK_B}`), '5,00');
    await fireEvent.press(screen.getByTestId(`management-offer-toggle-${STOCK_B}`));
    await fireEvent.changeText(screen.getByTestId(`management-offer-price-${STOCK_A}`), '8,50');
    await fireEvent.press(screen.getByTestId('management-offer-cta'));

    await waitFor(() =>
      expect(lastPostBody()).toEqual({ items: [{ stockId: STOCK_A, offerPriceCents: 850 }] }),
    );
  });

  it('açılamayan partinin akıbeti SATIRINDA — must_discard işaretlenir, liste tazelenir', async () => {
    let reads = 0;
    fetchMock.mockImplementation((url, init) => {
      if (init?.method === 'POST') {
        return Promise.resolve(
          ok({
            results: [
              { stockId: STOCK_A, status: 'ok' },
              { stockId: STOCK_B, status: 'must_discard' },
            ],
          }),
        );
      }
      reads += 1;
      return Promise.resolve(ok(candidates()));
    });

    await renderScreen(<OfferApprovalScreen />, 'management-offer-loading');
    await fireEvent.changeText(screen.getByTestId(`management-offer-price-${STOCK_B}`), '5,00');
    await fireEvent.press(screen.getByTestId('management-offer-cta'));

    await waitFor(() => expect(screen.getByTestId(`management-offer-failed-${STOCK_B}`)).toBeOnTheScreen());
    expect(screen.getByText(t.offer.failed.must_discard)).toBeOnTheScreen();
    expect(screen.getByTestId('management-offer-partial')).toBeOnTheScreen();
    // Onaydan sonra taze okuma — açılan parti motor gereği listeden düşecek.
    expect(reads).toBeGreaterThanOrEqual(2);
  });

  it('kart motorun ORANINI etiketinde yazar; tarihi geçen partide gün değil hâl okunur (v3:30)', async () => {
    fetchMock.mockImplementation((url, init) => {
      if (init?.method === 'POST') return Promise.resolve(ok({ results: [] }));
      return Promise.resolve(
        ok({
          candidates: [
            // Motor "satılabilir pencerede" diyebilir ama tarih geçmiş olabilir: `-1 gün` diye bir
            // ömür yoktur, hâl yazılır. Liste fiyatı da yok — uydurulmaz, çizgi konur.
            // Yüzde motorda böyle partide 0'a sabitlenir; 0 bir ÖLÇÜM değil, o yüzden yazılmaz.
            { ...candidates().candidates[0]!, daysLeft: -1, remainingPercent: 0, listPriceCents: null },
          ],
        }),
      );
    });

    await renderScreen(<OfferApprovalScreen />, 'management-offer-loading');

    expect(screen.getByText(t.offer.rows.lifeValuePast)).toBeOnTheScreen();
    expect(screen.queryByText(t.offer.rows.lifeValue.replace('{days}', '-1'))).toBeNull();
    expect(screen.queryByText(/%0/)).toBeNull();
    // Öneri oranı ayardan gelir ve etiketin İÇİNDE durur — operatör neyin üstüne yazdığını görür.
    expect(screen.getByText(t.offer.rows.suggested.replace('{percent}', '30'))).toBeOnTheScreen();
    expect(screen.getByText(t.offer.noSuggestion)).toBeOnTheScreen();
  });

  it('kalan ömür GÜN ve YÜZDE yazar; ölçülemeyen üründe yalnız gün (v3:30)', async () => {
    /* Tasarımın satırı "2 gün · %18" — iki sayı iki ayrı şey söylüyor: gün ne kadar kaldığını,
       yüzde ömrün ne kadarının tükendiğini. Motorun eşikleri de günle değil yüzdeyle veriliyor.
       İkinci parti raf ömrü tanımsız ürün: yüzde `null` gelir ve satır yalnız günü yazar —
       "%0" yazmak ölçemediğimizi ölçmüş gibi gösterirdi (CLAUDE §1). */
    fetchMock.mockResolvedValue(ok(candidates()));

    await renderScreen(<OfferApprovalScreen />, 'management-offer-loading');

    expect(screen.getByText('2 gün · %18')).toBeOnTheScreen();
    expect(screen.getByText('5 gün')).toBeOnTheScreen();
    expect(screen.queryByText(/5 gün · %/)).toBeNull();
  });

  it('aday yoksa boş hâl; CTA hiç çizilmez', async () => {
    fetchMock.mockResolvedValue(ok({ candidates: [] }));

    await renderScreen(<OfferApprovalScreen />, 'management-offer-loading');

    expect(screen.getByTestId('management-offer-empty')).toBeOnTheScreen();
    expect(screen.queryByTestId('management-offer-cta')).toBeNull();
  });
});

describe('Y4 · tedarik önerisi', () => {
  it('onay gövdesi yalnız grup kimliği; başarı etiketi kalem sayısını söyler', async () => {
    fetchMock.mockImplementation((url, init) => {
      if (init?.method === 'POST') {
        return Promise.resolve(ok({ status: 'ok', purchaseOrderId: '00000000-0000-4000-8000-0000000000dd', itemCount: 1 }));
      }
      return Promise.resolve(ok(supplyGroups()));
    });

    await renderScreen(<SupplySuggestionScreen />, 'management-supply-loading');

    expect(screen.getByText('Gaziantep Gıda · STR')).toBeOnTheScreen();
    expect(screen.getByText('+24')).toBeOnTheScreen();
    // Başka depodaki mal transferin HAM verisi olarak görünür.
    expect(screen.getByText(/KEHL 14/u)).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId(`management-supply-cta-${WAREHOUSE}:${SUPPLIER}`));

    await waitFor(() => expect(lastPostBody()).toEqual({ warehouseId: WAREHOUSE, supplierId: SUPPLIER }));
    await waitFor(() =>
      expect(screen.getByText(t.supply.ctaDone.replace('{n}', '1'))).toBeOnTheScreen(),
    );
  });

  it('ölçüm satırı dört GERÇEK sayıyı yazar: stok · eşik · yolda · son alış (v3:31)', async () => {
    fetchMock.mockResolvedValue(ok(supplyGroups()));

    await renderScreen(<SupplySuggestionScreen />, 'management-supply-loading');

    // v3'ün "günlük 3,1 · 8 gün" satırı sözleşmede YOK; satır elimizdeki ölçümlerle kurulur.
    expect(screen.getByText(/stok 6 · eşik 20 · yolda 0/u)).toBeOnTheScreen();
    expect(screen.getByText(/son alış 21,40/u)).toBeOnTheScreen();
    // Son alış bilinmeyen kalemde çizgi — sıfır gibi okutulmaz.
    expect(screen.getByText(/son alış —/u)).toBeOnTheScreen();
  });

  it('eşlenmemiş grup CTA çizmez — kapalı kapı açık cümleyle söylenir', async () => {
    fetchMock.mockResolvedValue(ok(supplyGroups()));

    await renderScreen(<SupplySuggestionScreen />, 'management-supply-loading');

    expect(screen.getByTestId('management-supply-unmapped')).toBeOnTheScreen();
    expect(screen.getByText(t.supply.unmapped.blocked)).toBeOnTheScreen();
    expect(screen.queryByTestId(`management-supply-cta-${WAREHOUSE}:unmapped`)).toBeNull();
  });

  it('no_suggestion "bayat ekran"dır: etiket değişir ve liste yeniden okunur', async () => {
    let reads = 0;
    fetchMock.mockImplementation((url, init) => {
      if (init?.method === 'POST') return Promise.resolve(ok({ status: 'no_suggestion' }));
      reads += 1;
      return Promise.resolve(ok(supplyGroups()));
    });

    await renderScreen(<SupplySuggestionScreen />, 'management-supply-loading');
    await fireEvent.press(screen.getByTestId(`management-supply-cta-${WAREHOUSE}:${SUPPLIER}`));

    await waitFor(() => expect(screen.getByText(t.supply.ctaStale)).toBeOnTheScreen());
    expect(reads).toBeGreaterThanOrEqual(2);
  });
});
