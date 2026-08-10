import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import type { CheckoutSnapshot } from '@lezzet/types';

import type { CartState } from '@/screens/customer-kit/cart-store';
import { cartView, cartViewLine } from '@/screens/cart/cart-view-fixture';
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
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }) }));

// Ad `mock` ile başlamak ZORUNDA: `jest.mock` fabrikası dosyanın tepesine kaldırılıyor.
let mockCart: CartState;
jest.mock('@/screens/customer-kit/cart-store', () => ({
  ...jest.requireActual<object>('@/screens/customer-kit/cart-store'),
  useCart: () => mockCart,
}));

/* Kimlik dört hâllidir ve ayrımı ekranın kendi testinin konusu; burada müşteri GİRİŞLİ sabitlendi
   ki ölçülen şey sipariş kapsamı olsun. */
jest.mock('@/screens/customer-kit/use-me.hook', () => ({
  useMe: () => ({ status: 'ready', me: { id: 'customer-1', name: 'Ayşe' }, refresh: () => undefined }),
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
  line1: '3 rue des Lilas',
  line2: null,
  postalCode: '75011',
  city: 'Paris',
  isDefault: true,
};

/**
 * Rota DIŞI adresin anlık görüntüsü: kargo yolu açık, soğuk zincir kalemi bu adrese gelemiyor.
 * `blocked` sunucunun cevabıdır — "bu adres soğuk zinciri kapatıyor" (`shippingBlockedReason`).
 */
function snapshot(blocked: boolean, orderTotalCents: number, shippingFeeCents = 650): CheckoutSnapshot {
  return {
    addresses: [ADDRESS],
    delivery: { deliveryType: 'shipping', availableDates: [], requiresDateChoice: false, blocked },
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
