import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { CheckoutSnapshot } from '@lezzet/types';

import type { CartState } from '@/screens/customer-kit/cart-store';
import { cartView, cartViewLine } from '@/screens/cart/cart-view-fixture';
import sheetMessages from '@/screens/customer-kit/address-sheet-messages.json';
import { CheckoutScreen } from './checkout-screen';
import messages from './messages.json';

/*
  "SİPARİŞİ TAMAMLA" — GELEMEYEN KALEM ENGEL DEĞİL, KAPSAM SORUSU (kullanıcı kararı 10.08).

  Ölçülen üç şey: bu adrese gelemeyen kalem özette YAZILMAZ (siparişe girmiyor), toplama SAYILMAZ
  (ara toplam yalnız siparişe gireni toplar) ve kırmızı engel kutusunun yerine BİLGİ satırı çıkar —
  eskiden "o kalemleri sepetten çıkarın" diyen bir hata kutusu vardı ve sipariş hiç açılmıyordu.

  ANLIK GÖRÜNTÜ GERÇEK KAPIDAN GEÇER: `fetch` taklit edildi, `fetchCheckout` ve şeması değil —
  ekranın gördüğü veri gerçekten `CheckoutSnapshotSchema`dan geçiyor. Sepet görünümü ise depodan
  okunur, o yüzden yalnız `useCart` sahtelendi.
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-FR' }] }));
/* `replace` CASUSU sabit: onay ekranına NE TAŞINDIĞI (özellikle sipariş numarası) bu ekranın
   kararlarından biri ve her çağrıda yeni `jest.fn()` üreten bir mock onu ölçülemez kılardı. */
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: mockReplace }) }));

// Ad `mock` ile başlamak ZORUNDA: `jest.mock` fabrikası dosyanın tepesine kaldırılıyor.
let mockCart: CartState;
jest.mock('@/screens/customer-kit/cart-store', () => ({
  ...jest.requireActual<object>('@/screens/customer-kit/cart-store'),
  useCart: () => mockCart,
}));

/* Kimlik dört hâllidir ve ayrımı ekranın kendi testinin konusu; burada müşteri GİRİŞLİ sabitlendi
   ki ölçülen şey sipariş kapsamı olsun. */
/* Fikstür `phone` TAŞIMAK ZORUNDA: sözleşmede alan zorunlu ve `null` OLABİLİR ama yok olamaz
   (`MeSchema.phone` = `.nullable()`, `.optional()` değil). Eksik bırakıldığında ekranın iletişim
   ölçütü (`isPhoneMissing`) `undefined.trim()` ile patlıyordu — fikstürün sözleşmeden sapmasıydı,
   ölçütün kusuru değil. Dolu veriliyor ki bu dosyanın konusu (gelemeyen kalemler) iletişim
   bölümüyle karışmasın; bölümün kendi testi ayrı. */
jest.mock('@/screens/customer-kit/use-me.hook', () => ({
  publishMe: () => undefined,
  useMe: () => ({
    status: 'ready',
    me: { id: 'customer-1', name: 'Ayşe', email: 'ayse@example.com', phone: '+33612345678' },
    refresh: () => undefined,
  }),
}));

/* ÖDEME KARTI: Stripe'ın kendi Jest mock'u `PaymentSheetError` numaralandırmasını TAŞIMIYOR ve
   modül import edilir edilmez düşüyor (ölçüldü: "Cannot read properties of undefined (reading
   'Failed')"). Kapı burada sahtelendi — bu dosyanın ölçtüğü şey ödeme değil, siparişin kapsamı. */
jest.mock('@/lib/payment/payment-sheet', () => ({ presentPayment: async () => ({ status: 'canceled' }) }));

jest.mock('@/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'access-1' } } }),
      refreshSession: async () => ({ data: { session: { access_token: 'access-1' } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  }),
}));

const t = messages.tr;

const ADDRESS = {
  id: '11111111-1111-4111-8111-111111111111',
  label: 'Ev',
  // Adres artık teslim alacak kişiyi ve numarayı da taşıyor (22.08 · kullanıcı kararı).
  recipient: 'Claire Weber',
  phone: '+33612345678',
  line1: '3 rue des Lilas',
  line2: null,
  postalCode: '75011',
  city: 'Paris',
  country: 'FR' as const,
  isDefault: true,
  /* Fatura adresi teslimat seçimini KISITLAMIYOR (kullanıcı kararı 08.09): checkout tüm adresleri
     listelemeye devam ediyor. Bu fikstür bireysel bir hesabın ev adresi — işaretsiz. */
  isBilling: false,
};

/**
 * Rota DIŞI adresin anlık görüntüsü: kargo yolu açık, soğuk zincir kalemi bu adrese gelemiyor.
 * `blocked` sunucunun cevabıdır — "bu adres soğuk zinciri kapatıyor" (`shippingBlockedReason`).
 */
function snapshot(blocked: boolean, orderTotalCents: number, shippingFeeCents = 650): CheckoutSnapshot {
  return {
    addresses: [ADDRESS],
    // Komşu daveti (21.45) bu senaryonun konusu değil: kargo siparişinde davet zaten açılmıyor.
    delivery: { deliveryType: 'shipping', availableDates: [], requiresDateChoice: false, neighborInvites: [], blocked },
    payment: {
      methods: ['online'],
      creditAvailable: false,
      codBlockedReason: null,
      cashWarning: false,
      shippingFeeCents,
      shippingFreeReason: null,
      orderTotalCents,
      minBasketOk: true,
      missingForMinBasketCents: 0,
      placeLabel: '75011 Paris',
    },
    /* ÖZET FİKSTÜRDE DE SUNUCUNUN İŞİ (21.08): ekran artık dökümü buradan çiziyor, yerel sepetten
       değil — arıza tam olarak ikisinin ayrışabilmesiydi. Fikstür bu yüzden sunucunun yaptığı
       ayrımı BİREBİR tekrarlıyor (`group === 'undeliverable'` → kapsam dışı) ve `mockCart`tan
       türetiliyor: elle yazılmış bir liste, testin sepetiyle sessizce ayrışır ve o gün test
       ekranın değil kendisinin doğruluğunu ölçmeye başlardı. */
    summary: summaryOfMockCart(),
  };
}

/** Anlık görüntünün özeti — `mockCart`ın satırlarından, sunucunun kapsam ayrımıyla. */
function summaryOfMockCart(): NonNullable<CheckoutSnapshot['summary']> {
  const lines = mockCart.view.lines;
  const row = (line: (typeof lines)[number]) => ({
    kind: line.kind,
    name: line.name,
    qty: line.qty,
    lineTotalCents: line.lineTotalCents,
  });
  const kept = lines.filter((line) => line.group !== 'undeliverable');
  return {
    lines: kept.map(row),
    subtotalCents: kept.reduce((sum, line) => sum + (line.lineTotalCents ?? 0), 0),
    discount: null,
    excludedLines: lines.filter((line) => line.group === 'undeliverable').map(row),
    fingerprint: 'test-fingerprint',
  };
}

function cartWith(view: CartState['view']): CartState {
  return { products: [], bundles: [], couponCode: null, coupon: null, view, resolving: false, source: 'server', error: null };
}

const fetchMock = jest.fn<Promise<Response>, Parameters<typeof fetch>>();

function reply(body: unknown): Response {
  return { status: 200, headers: { get: () => null }, json: async () => ({ data: body, error: null }) } as unknown as Response;
}

beforeAll(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://api.test';
  globalThis.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  fetchMock.mockReset();
});

describe('CheckoutScreen — siparişin kapsamı', () => {
  it('gelemeyen kalemi özete ÜSTÜ ÇİZİLİ yazar ve ara toplamı yalnız siparişe girenlerden kurar', async () => {
    mockCart = cartWith(
      cartView([
        cartViewLine(1, 'Baklava', 'local', { unitPriceCents: 2000 }),
        cartViewLine(2, 'Şekerpare', 'local', { unitPriceCents: 550 }),
        cartViewLine(3, 'Kaymak', 'undeliverable', { unitPriceCents: 1250 }),
      ]),
    );
    fetchMock.mockResolvedValue(reply(snapshot(true, 3150)));

    await render(<CheckoutScreen />);

    await waitFor(() => expect(screen.getByTestId('checkout-summary')).toBeOnTheScreen());
    const summary = within(screen.getByTestId('checkout-summary'));
    expect(summary.getByText('1× Baklava')).toBeOnTheScreen();
    expect(summary.getByText('1× Şekerpare')).toBeOnTheScreen();
    /* Gelemeyen kalem GİZLENMEZ, ÜSTÜ ÇİZİLİR (kullanıcı kararı 10.08): özetten sessizce çıkan
       kalem müşteriye "herhâlde bunları alıyorum" dedirtiyordu — karar özetin uzağında, adresin
       yanında duruyordu. Artık kalem gözün gittiği yerde ve kararı üstünde yazılı. */
    const dropped = summary.getByText('1× Kaymak');
    expect(dropped).toBeOnTheScreen();
    expect(dropped).toHaveStyle({ textDecorationLine: 'line-through' });
    // NEDEN olduğu da özetin İÇİNDE — uyarı listeden uzakta kalmasın.
    expect(summary.getByText(messages.tr.summary.undeliverableNote)).toBeOnTheScreen();
    // Ara toplam 38,00 € DEĞİL 25,50 €: gelemeyen kalem siparişe girmiyor, matrahtan düşüyor.
    expect(summary.getByText('25,50 €')).toBeOnTheScreen();
    expect(summary.queryByText('38,00 €')).toBeNull();
  });

  it('kırmızı engel yerine BİLGİ satırı çizer ve onay düğmesi AÇIK kalır', async () => {
    mockCart = cartWith(
      cartView([cartViewLine(1, 'Baklava', 'local'), cartViewLine(3, 'Kaymak', 'undeliverable')]),
    );
    fetchMock.mockResolvedValue(reply(snapshot(true, 2000)));

    await render(<CheckoutScreen />);

    await waitFor(() => expect(screen.getByTestId('checkout-undeliverable')).toBeOnTheScreen());
    expect(screen.getByText(t.undeliverable.title)).toBeOnTheScreen();
    // Bekleyen kalemin adı da yazılır: müşteri neyin sepette kaldığını bilsin.
    expect(screen.getByText(`${t.undeliverable.body} ${t.undeliverable.items.replace('{items}', 'Kaymak')}`)).toBeOnTheScreen();
    // Eski engel cümlesi ARTIK YAZILMIYOR — sunucu siparişi reddetmiyor, kapsamını daraltıyor.
    expect(screen.queryByText(t.block.shipping)).toBeNull();
    /* Kalan tek engel ÖDEME SEÇİMİDİR; seçilince onay açılır — gelemeyen kalem kapıyı kapatmıyor.
       Dokunuş ERİŞİLEBİLİR öğeye yapılır (kitin kendi testinin kalıbı): `testID` görsel yüzeyde
       durur, işleyici ise onu saran `Pressable`da. */
    await fireEvent.press(screen.getByRole('button', { name: `${t.payment.online} · ${t.payment.onlineBody}` }));
    expect(screen.getByRole('button', { name: t.confirmPay.replace('{total}', '20,00 €') })).toBeEnabled();
  });

  it('adres bölge içiyse hiçbir kalem düşmez: engel yok, özet sepetin tamamını yazar', async () => {
    mockCart = cartWith(
      cartView([
        cartViewLine(1, 'Baklava', 'local', { unitPriceCents: 2000 }),
        cartViewLine(3, 'Kaymak', 'local', { unitPriceCents: 1250 }),
      ]),
    );
    fetchMock.mockResolvedValue(reply(snapshot(false, 3900)));

    await render(<CheckoutScreen />);

    await waitFor(() => expect(screen.getByTestId('checkout-summary')).toBeOnTheScreen());
    expect(screen.queryByTestId('checkout-undeliverable')).toBeNull();
    const summary = within(screen.getByTestId('checkout-summary'));
    expect(summary.getByText('1× Kaymak')).toBeOnTheScreen();
    expect(summary.getByText('32,50 €')).toBeOnTheScreen();
  });
});

/*
  SİPARİŞ NUMARASI ONAY EKRANINA TAŞINIYOR (27.08 · eski `BEKLEYEN(21.14)`).

  Cevap eskiden yalnız `orderId` (uuid) taşıyordu; müşteriye gösterilen `LA-26-…` hiçbir yoldan
  ekrana ulaşamıyor ve onay ekranı o satırı hiç çizmiyordu. Sözleşmenin `placed` dalı artık
  `referenceNo` taşıyor (`transitionOrder`ın kendi cevabı — ek okuma yok).

  ÖLÇÜLEN ŞEY GEÇİŞİN PARAMETRESİ, ekranın çizimi değil: numarayı çizen yer onay ekranı ve orası
  kendi testinde ölçülüyor. Burada sorulan tek soru "cevaptaki numara rotaya yazıldı mı".

  HAVALE YOLU seçildi çünkü sipariş bu yolda TEK çağrıda kesinleşiyor: kart yolu ödeme kartını
  açar (`presentPayment` bu dosyada sahtelenmiş) ve orada numara zaten YOKTUR — sipariş o an hâlâ
  taslaktır, onayı webhook yazar.
*/
describe('CheckoutScreen — sipariş numarası', () => {
  /** Havale ile ödenen KARGO siparişi: gün sorulmaz, ödeme kartı açılmaz — tek çağrıda kesinleşir. */
  function transferSnapshot(): CheckoutSnapshot {
    const base = snapshot(false, 2000);
    return { ...base, payment: { ...base.payment!, methods: ['bank_transfer'] } };
  }

  /** İki uç, tek mock: okuma GET'ten, sipariş POST'tan. URL'e bakmayan bir mock ikisine aynı cevabı verirdi. */
  function routeFetch(orderBody: unknown): void {
    fetchMock.mockImplementation(async (input, init) => {
      const method = (init as { method?: string } | undefined)?.method ?? 'GET';
      return method === 'POST' ? reply(orderBody) : reply(transferSnapshot());
    });
  }

  async function placeOrder(): Promise<void> {
    mockCart = cartWith(cartView([cartViewLine(2, 'Ceviz', 'shipping', { unitPriceCents: 2000 })]));

    await render(<CheckoutScreen />);
    await waitFor(() => expect(screen.getByTestId('checkout-summary')).toBeOnTheScreen());
    await fireEvent.press(screen.getByRole('button', { name: `${t.payment.transfer} · ${t.payment.transferBody}` }));
    await fireEvent.press(screen.getByTestId('checkout-confirm'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
  }

  beforeEach(() => mockReplace.mockReset());

  it('cevaptaki numarayı onay ekranına TAŞIR', async () => {
    routeFetch({
      status: 'placed',
      orderId: '22222222-2222-4222-8222-222222222222',
      totalCents: 2000,
      deliveryType: 'shipping',
      referenceNo: 'LA-26-7K4M2P',
    });

    await placeOrder();

    expect(mockReplace).toHaveBeenCalledWith(
      expect.objectContaining({ params: expect.objectContaining({ reference: 'LA-26-7K4M2P' }) }),
    );
  });

  it('numara YOKSA parametreyi hiç yazmaz — boş dize de bir değerdir', async () => {
    routeFetch({
      status: 'placed',
      orderId: '22222222-2222-4222-8222-222222222222',
      totalCents: 2000,
      deliveryType: 'shipping',
      referenceNo: null,
    });

    await placeOrder();

    const params = (mockReplace.mock.calls[0]?.[0] as { params: Record<string, unknown> }).params;
    expect(params).not.toHaveProperty('reference');
    // Siparişin kimliği yine taşınıyor: komşu daveti onunla açılıyor (21.45).
    expect(params.orderId).toBe('22222222-2222-4222-8222-222222222222');
  });
});

/*
  ADRES DÜZELTME TEKLİFİ (11.11 · 21.308) — "Siparişi onayla"ya basıldığı an, BİR KEZ, ve ENGEL
  DEĞİL (tasarım `musteri-checkout.md` §4c). Web checkout'unun kuralı birebir: söylenecek bir şey
  varsa ilk dokunuş durur; kabul KAYDI düzeltir, ret bir beyandır ve soru tekrarlanmaz; servis
  düşerse satış durmaz.

  UZUN BASMA (21.215) aynı dosyada: kayıtlı adresi sipariş akışından çıkmadan düzeltmenin yolu.
*/
describe('CheckoutScreen — adres teklifi ve düzenleme', () => {
  const WRONG_CODE = {
    status: 'wrong_postal_code',
    label: '192c Rue du Maréchal Foch 67380 Lingolsheim',
    postalCode: '67380',
    city: 'Lingolsheim',
  };

  /** Havale ile ödenen kargo siparişi: gün sorulmaz, ödeme kartı açılmaz — tek çağrıda kesinleşir. */
  function transferSnapshot(): CheckoutSnapshot {
    const base = snapshot(false, 2000);
    return { ...base, payment: { ...base.payment!, methods: ['bank_transfer'] } };
  }

  /* Doğrulama ucu `/me/addresses/:id/check` — `includes('/check')` YETMEZ, `/me/checkout`u da
     yakalar (ilk yazımda anlık görüntü doğrulama cevabıyla ezildi ve yedi test birden düştü). */
  const CHECK_URL = /\/me\/addresses\/[^/?]+\/check$/;

  /** Dört uç, tek mock: okuma · doğrulama · adres yazımı · sipariş. `Error` = doğrulama isteği düşer. */
  function routeFetch(check: unknown): void {
    fetchMock.mockImplementation(async (input, init) => {
      const url = String(input);
      const method = (init as { method?: string } | undefined)?.method ?? 'GET';
      if (CHECK_URL.test(url)) {
        if (check instanceof Error) throw check;
        return reply(check);
      }
      if (method === 'PATCH') return reply([{ ...ADDRESS, postalCode: '67380', city: 'Lingolsheim' }]);
      if (method === 'POST') {
        return reply({
          status: 'placed',
          orderId: '22222222-2222-4222-8222-222222222222',
          totalCents: 2000,
          deliveryType: 'shipping',
          referenceNo: 'LA-26-7K4M2P',
        });
      }
      return reply(transferSnapshot());
    });
  }

  const callsTo = (fragment: string) => fetchMock.mock.calls.filter(([url]) => String(url).includes(fragment));
  const checkCalls = () => fetchMock.mock.calls.filter(([url]) => CHECK_URL.test(String(url)));

  async function openCheckout(): Promise<void> {
    mockCart = cartWith(cartView([cartViewLine(2, 'Ceviz', 'shipping', { unitPriceCents: 2000 })]));
    await render(<CheckoutScreen />);
    await waitFor(() => expect(screen.getByTestId('checkout-summary')).toBeOnTheScreen());
  }

  async function openAndConfirm(): Promise<void> {
    await openCheckout();
    await fireEvent.press(screen.getByRole('button', { name: `${t.payment.transfer} · ${t.payment.transferBody}` }));
    await fireEvent.press(screen.getByTestId('checkout-confirm'));
  }

  beforeEach(() => mockReplace.mockReset());

  it('kapı BAŞKA kodda bulunduysa sipariş DURUR ve teklif servisin etiketiyle gelir', async () => {
    routeFetch(WRONG_CODE);
    await openAndConfirm();

    const offer = await screen.findByTestId('checkout-address-check');
    expect(within(offer).getByText(t.addressCheck.foundElsewhere)).toBeOnTheScreen();
    expect(within(offer).getByText(WRONG_CODE.label)).toBeOnTheScreen();
    expect(callsTo('/checkout/order')).toHaveLength(0);
  });

  it('"Böyle kaydet" KAYDI düzeltir: yalnız kod ve şehir değişir, öteki alanlar olduğu gibi gider', async () => {
    routeFetch(WRONG_CODE);
    await openAndConfirm();

    await fireEvent.press(await screen.findByTestId('checkout-address-fix'));

    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(true));
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(String(patch?.[0])).toContain(`/api/v1/me/addresses/${ADDRESS.id}`);
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({
      label: 'Ev',
      recipient: 'Claire Weber',
      phone: '+33612345678',
      line1: '3 rue des Lilas',
      line2: null,
      postalCode: '67380',
      city: 'Lingolsheim',
    });
    expect(callsTo('/checkout/order')).toHaveLength(0);
  });

  it('"Benim yazdığım doğru" bir BEYANDIR: teklif kapanır, ikinci dokunuşta sipariş geçer, soru tekrarlanmaz', async () => {
    routeFetch(WRONG_CODE);
    await openAndConfirm();

    await fireEvent.press(await screen.findByTestId('checkout-address-keep'));
    expect(screen.queryByTestId('checkout-address-check')).toBeNull();

    await fireEvent.press(screen.getByTestId('checkout-confirm'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(checkCalls()).toHaveLength(1);
  });

  it('kapı doğrulandıysa soru HİÇ görünmez, sipariş ilk dokunuşta geçer', async () => {
    routeFetch({ status: 'confirmed' });
    await openAndConfirm();

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(screen.queryByTestId('checkout-address-check')).toBeNull();
  });

  it('doğrulama isteği DÜŞERSE satış durmaz (fail-open)', async () => {
    routeFetch(new Error('offline'));
    await openAndConfirm();

    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
    expect(screen.queryByTestId('checkout-address-check')).toBeNull();
  });

  it('sokak var, kapı yok: DÜĞMESİZ tek satır — ikinci dokunuşta sipariş geçer', async () => {
    routeFetch({ status: 'street_only' });
    await openAndConfirm();

    expect(await screen.findByTestId('checkout-address-check')).toHaveTextContent(t.addressCheck.streetOnly);
    expect(screen.queryByTestId('checkout-address-fix')).toBeNull();

    await fireEvent.press(screen.getByTestId('checkout-confirm'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalled());
  });

  it('adres satırı UZUN BASINCA çekmeceyi DÜZENLEME hâlinde açar ve ipucunu taşır (21.215)', async () => {
    routeFetch({ status: 'confirmed' });
    await openCheckout();

    const row = screen.getByTestId(`checkout-address-${ADDRESS.id}`);
    expect(within(row).getByText(t.address.editHint)).toBeOnTheScreen();

    await fireEvent(row, 'longPress');

    expect(await screen.findByText(sheetMessages.tr.titleEdit)).toBeOnTheScreen();
  });
});
