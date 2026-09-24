import { fireEvent, render, screen, within } from '@testing-library/react-native';

import type { CartState } from '@/screens/customer-kit/cart-store';
import { CartScreen } from './cart-screen';
import { cartView, cartViewBundleLine, cartViewLine, cartWith } from './cart-view-fixture';
import messages from '@lezzet/i18n/customer/cart';

/*
  Sepetin üç grubu sözleşmeden okunur: bu adrese gelemeyen kalem kapı grubuna girerse sepet yeşil "Siparişi tamamla" gösterir ve
  engel ancak checkout'ta çıkar. Yalnız `useCart` sahtelenir; `cartLineId` ve `cartCount` gerçek kalır ki ekranın çizdiği ölçülsün.
*/

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageTag: 'tr-FR' }] }));

/* Bant posta kodunu adıyla söyler ve kodu gezinme deposundan okur; depo sahtelenmezse ekran boş kod yazar. */
jest.mock('@/lib/onboarding/onboarding-store', () => {
  // Referans sabit, çünkü `useSyncExternalStore` her okumada yeni nesne görürse sonsuz yeniden çizime girer.
  const snapshot = { locale: 'tr', postalCode: '67380' };
  return {
    subscribeOnboarding: () => () => undefined,
    getOnboardingSnapshot: () => snapshot,
  };
});
/* Yönlendirme CASUSU sabit: düğmenin hangi ROTAYI açtığı bu ekranın kararlarından biri
   (salt-kargo sepette kargo taslağı) ve her çağrıda yeni bir `jest.fn()` üreten mock onu
   ölçülemez kılardı. */
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));

/* Posta kodu çekmecesi (bant içindeki "Posta kodunu değiştir") kitin kanonik dosyasıdır ve oturumu
   okur; ekran testinin oturum altyapısına bağlanmaması için supabase kapısı sahteleniyor —
   `checkout-screen.test`in aynı deseni. Sepetin kendi davranışı oturumdan bağımsız. */
jest.mock('@lezzet/mobile-kit/src/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
    },
  }),
}));

// Ad `mock` ile başlamak ZORUNDA: `jest.mock` fabrikası dosyanın tepesine kaldırılıyor ve Babel
// yalnız bu önekli değişkenlere kapanış izni veriyor.
let mockCart: CartState;
jest.mock('@/screens/customer-kit/cart-store', () => ({
  ...jest.requireActual<object>('@/screens/customer-kit/cart-store'),
  useCart: () => mockCart,
}));

const t = messages.tr;

describe('CartScreen — üç gruplu sepet', () => {
  it('grupları SÖZLEŞMEDEN ayırır ve üçünün de başlığını çizer', async () => {
    mockCart = cartWith(
      cartView([
        cartViewLine(1, 'Baklava', 'local'),
        cartViewLine(2, 'Kuru kayısı', 'shipping'),
        cartViewLine(3, 'Kaymak', 'undeliverable'),
      ]),
    );

    await render(<CartScreen />);

    expect(screen.getByTestId('cart-group-local')).toBeOnTheScreen();
    expect(screen.getByTestId('cart-group-shipping')).toBeOnTheScreen();
    expect(screen.getByTestId('cart-group-undeliverable')).toBeOnTheScreen();
    // Üç satırın üçü de sepette DURUYOR: gelemeyen kalem gizlenmez, sildirilmez.
    expect(screen.getByText('Baklava')).toBeOnTheScreen();
    expect(screen.getByText('Kuru kayısı')).toBeOnTheScreen();
    expect(screen.getByText('Kaymak')).toBeOnTheScreen();
  });

  /* Ürünler üstte, paketler altta; sunucu satırları eklenme sırasıyla verir ve burada bilerek karışık gelir. Tür sınırı ile sıranın
     kararlılığı birlikte tutulur: iki ürün ile iki paket kendi aralarında eklenme sırasını korur. */
  it('grup içinde ürünleri paketlerin ÜSTÜNE alır, eklenme sırasını bozmadan', async () => {
    mockCart = cartWith(
      cartView([
        cartViewBundleLine(10, 'Bayram Sofrası', 'local'),
        cartViewLine(1, 'Baklava', 'local'),
        cartViewBundleLine(11, 'Fıstık Sevenler', 'local'),
        cartViewLine(2, 'Şekerpare', 'local'),
      ]),
    );

    await render(<CartScreen />);

    /* Sıra EKRANDAN okunur: `cart-group-*` testID'si başlığa ait, satırları sarmıyor — tek gruplu
       bu sepette zaten başlık da çizilmiyor. Dört ad tek eşleşmeyle alınıp çizim sırası ölçülüyor. */
    const cizilen = screen.getAllByText(/^(Baklava|Şekerpare|Bayram Sofrası|Fıstık Sevenler)$/).map((n) => n.props.children);
    expect(cizilen).toEqual(['Baklava', 'Şekerpare', 'Bayram Sofrası', 'Fıstık Sevenler']);
  });

  it('teslimat grubunun sırasını BOZMAZ — paket kargo grubunda kalır', async () => {
    mockCart = cartWith(
      cartView([
        cartViewBundleLine(10, 'Kargo Paketi', 'shipping'),
        cartViewLine(1, 'Yerel Baklava', 'local'),
      ]),
    );

    await render(<CartScreen />);

    /* Paket bütün sepetin en altına İNMEZ, kendi grubunda kalır: grup ayrımı tür ayrımından ÖNCE
       gelir (bir kalemin nasıl geleceği, ne olduğundan önce). Sıra `local` → `shipping` olduğu için
       yerel ÜRÜN, kargo PAKETİNDEN önce çizilir — tür sıralaması grupları karıştırsaydı ters olurdu. */
    const cizilen = screen.getAllByText(/^(Kargo Paketi|Yerel Baklava)$/).map((n) => n.props.children);
    expect(cizilen).toEqual(['Yerel Baklava', 'Kargo Paketi']);
  });

  /* Adı çözülemeyen satıra ad verilir, çünkü adsız bir kutu müşteriye neyi çıkaracağını söylemez. */
  it('adı çözülemeyen satır adsız kalmaz', async () => {
    // Çözülemeyen satırın gerçek hâli: ad boş, fiyat `null`, engelli.
    mockCart = cartWith(cartView([cartViewLine(1, '', 'local', { blocked: true, unitPriceCents: null })]));

    await render(<CartScreen />);

    expect(screen.getByText(t.line.unknown)).toBeOnTheScreen();
    // Gerekçe zaten vardı; eksik olan adın kendisiydi — ikisi birlikte anlam taşıyor.
    expect(screen.getByText(t.line.closed)).toBeOnTheScreen();
    // Fiyatı çözülemeyen satır tutar yerine de bunu yazar; boş bir "0,00 €" göstermez.
    expect(screen.getByText(t.line.noPrice)).toBeOnTheScreen();
  });

  it('gelemeyen kalem için satırların üstünde TEK uyarı ve satırda kısa künye yazar', async () => {
    mockCart = cartWith(
      cartView([cartViewLine(1, 'Baklava', 'local'), cartViewLine(3, 'Kaymak', 'undeliverable')]),
    );

    await render(<CartScreen />);

    expect(screen.getByTestId('cart-undeliverable')).toBeOnTheScreen();
    expect(screen.getByText(t.undeliverable.title.replace('{place}', '67380'))).toBeOnTheScreen();
    // Uyarı çıkış yolunu söyler; "ürünü kaldırın" demez.
    expect(screen.getByText(t.undeliverable.body.replace(/\{place\}/g, '67380'))).toBeOnTheScreen();
    expect(screen.getByText(t.line.undeliverable)).toBeOnTheScreen();
  });

  it('gelemeyen kalem varken "Siparişi tamamla" AÇIK kalır — satılamaz kalem varken kapanır', async () => {
    mockCart = cartWith(
      cartView([cartViewLine(1, 'Baklava', 'local'), cartViewLine(3, 'Kaymak', 'undeliverable')]),
    );

    await render(<CartScreen />);

    // `hasBlocked` satırların kendi hâlinden türer ve gelemeyen kalem onu doldurmaz: teslim edilebilirlik ile satılabilirlik ayrı
    // sorulardır.
    expect(mockCart.view.hasBlocked).toBe(false);
    expect(screen.getByRole('button', { name: t.checkout })).toBeEnabled();
  });

  it('SATILAMAZ kalem düğmeyi kapatır — o kalem sessizce siparişten düşürülemez', async () => {
    mockCart = cartWith(
      cartView([cartViewLine(1, 'Baklava', 'local', { blocked: true }), cartViewLine(3, 'Kaymak', 'undeliverable')]),
    );

    await render(<CartScreen />);

    expect(screen.getByRole('button', { name: t.checkout })).toBeDisabled();
  });

  it('özet gelemeyen kalemlerin tutarını ayrı satırda yazar ve toplamın kapsamını söyler', async () => {
    mockCart = cartWith(
      cartView([
        cartViewLine(1, 'Baklava', 'local', { unitPriceCents: 2000 }),
        cartViewLine(3, 'Kaymak', 'undeliverable', { unitPriceCents: 1250 }),
      ]),
    );

    await render(<CartScreen />);

    // Tutar SATIRDA da yazıyor; ölçüm ÖZET panelinin içinde yapılır ki iki yerin karışmadığı
    // görülsün.
    const summary = within(screen.getByTestId('cart-summary'));
    expect(summary.getByText(t.summary.undeliverable)).toBeOnTheScreen();
    expect(summary.getByText('12,50 €')).toBeOnTheScreen();
    expect(screen.getByText(`${t.summary.note} ${t.summary.undeliverableNote}`)).toBeOnTheScreen();
  });
});

describe('CartScreen — İKİ GRUP, İKİ SİPARİŞ', () => {
  it('kargo grubuna KENDİ eylemini verir; rota grubunun düğmesi yapışkan barda kalır', async () => {
    mockCart = cartWith(
      cartView([
        cartViewLine(1, 'Baklava', 'local', { unitPriceCents: 2000 }),
        cartViewLine(2, 'Kurabiye', 'shipping', { unitPriceCents: 1500 }),
      ]),
    );

    await render(<CartScreen />);

    // İki grup başlığı da çizilir — ayrılacak bir şey VAR.
    expect(screen.getByTestId('cart-group-local')).toBeOnTheScreen();
    expect(screen.getByTestId('cart-group-shipping')).toBeOnTheScreen();
    // Kargo grubunun kendi kartı ve İKİNCİ siparişi açan düğmesi.
    expect(screen.getByTestId('cart-shipping-group')).toBeOnTheScreen();
    expect(screen.getByTestId('cart-shipping-checkout')).toBeOnTheScreen();
    // Rota grubunun künyesi var ama düğmesi YOK: o yapışkan barda.
    expect(screen.getByTestId('cart-route-group')).toBeOnTheScreen();
    expect(screen.getByText(t.group.routeTotal.replace('{amount}', '20,00 €'))).toBeOnTheScreen();
    // Yapışkan bar sepetin tamamını (35,00 €) değil ROTA siparişini yazar.
    expect(within(screen.getByTestId('cart-checkout')).getByText('20,00 €')).toBeOnTheScreen();
  });

  it('bölünmüş sepette düğme kapı siparişinin kendi indirimiyle tutarını yazar', async () => {
    mockCart = cartWith(
      cartView(
        [cartViewLine(1, 'Baklava', 'local', { unitPriceCents: 2000 }), cartViewLine(2, 'Kurabiye', 'shipping', { unitPriceCents: 1500 })],
        { localOrderDiscountCents: 200 },
      ),
    );

    await render(<CartScreen />);

    // Kapı siparişi indirimini checkout'ta yalnız kendi kalemiyle alır; düğme o siparişin tutarını yazar.
    expect(within(screen.getByTestId('cart-checkout')).getByText('18,00 €')).toBeOnTheScreen();
  });

  it('salt-kargo sepette kargo ücreti özette ayrı satırdır, toplama ve düğmeye girer', async () => {
    mockCart = cartWith(cartView([cartViewLine(2, 'Kurabiye', 'shipping', { unitPriceCents: 1500 })]));

    await render(<CartScreen />);

    const summary = within(screen.getByTestId('cart-summary'));
    expect(summary.getByText(t.group.shippingRow)).toBeOnTheScreen();
    expect(summary.getByText('6,90 €')).toBeOnTheScreen();
    expect(summary.getByText('21,90 €')).toBeOnTheScreen();
    expect(within(screen.getByTestId('cart-checkout')).getByText('21,90 €')).toBeOnTheScreen();
  });

  it('tek gruplu sepette ikinci sipariş eylemi HİÇ çizilmez', async () => {
    mockCart = cartWith(cartView([cartViewLine(2, 'Kurabiye', 'shipping', { unitPriceCents: 1500 })]));

    await render(<CartScreen />);

    expect(screen.queryByTestId('cart-shipping-group')).toBeNull();
    expect(screen.queryByTestId('cart-route-group')).toBeNull();
  });
});

describe('CartScreen — tek gruplu sepet', () => {
  it('başlık ÇİZMEZ: ayrılacak bir şey yokken başlık olmayan bir seçimi varmış gibi gösterir', async () => {
    mockCart = cartWith(cartView([cartViewLine(1, 'Baklava', 'local'), cartViewLine(2, 'Şekerpare', 'local')]));

    await render(<CartScreen />);

    expect(screen.queryByTestId('cart-group-local')).toBeNull();
    expect(screen.queryByTestId('cart-group-shipping')).toBeNull();
    expect(screen.queryByTestId('cart-group-undeliverable')).toBeNull();
    // Uyarı da yok: gelemeyen kalem olmayan sepette bir sorun yok.
    expect(screen.queryByTestId('cart-undeliverable')).toBeNull();
    expect(screen.getByText('Baklava')).toBeOnTheScreen();
    expect(screen.getByText('Şekerpare')).toBeOnTheScreen();
  });

  it('sepetin TAMAMI gelemiyorsa da başlık çizilmez ama uyarı durur', async () => {
    mockCart = cartWith(cartView([cartViewLine(3, 'Kaymak', 'undeliverable')]));

    await render(<CartScreen />);

    expect(screen.queryByTestId('cart-group-undeliverable')).toBeNull();
    expect(screen.getByTestId('cart-undeliverable')).toBeOnTheScreen();
  });
});

/*
  Salt-kargo sepetin tek düğmesi kargo taslağını açar; düz `/checkout`a gitseydi ekran "kargoyla gönderilir" derken kapıya teslim
  siparişi açılırdı. Bayrak türetilmez, rotadan gelir ve burada ölçülen ekranın hangi adresi açtığıdır.
*/
describe('CartScreen — düğme hangi siparişi açıyor', () => {
  beforeEach(() => mockPush.mockReset());

  it('SALT-KARGO sepette kargo taslağını açar', async () => {
    mockCart = cartWith(cartView([cartViewLine(1, 'Kuru kayısı', 'shipping'), cartViewLine(2, 'Ceviz', 'shipping')]));

    await render(<CartScreen />);
    await fireEvent.press(screen.getByTestId('cart-checkout'));

    expect(mockPush).toHaveBeenCalledWith('/checkout?group=shipping');
  });

  it('KARIŞIK sepette bar ROTA taslağını açar — kargo yarısının kendi düğmesi var', async () => {
    mockCart = cartWith(cartView([cartViewLine(1, 'Baklava', 'local'), cartViewLine(2, 'Ceviz', 'shipping')]));

    await render(<CartScreen />);
    await fireEvent.press(screen.getByTestId('cart-checkout'));

    expect(mockPush).toHaveBeenCalledWith('/checkout');
    // İkinci sipariş bu ekranda ayrı bir düğmedir; bar onun yerine geçmez.
    expect(screen.getByTestId('cart-shipping-checkout')).toBeOnTheScreen();
  });

  it('SALT-ROTA sepette düz checkout açar', async () => {
    mockCart = cartWith(cartView([cartViewLine(1, 'Baklava', 'local')]));

    await render(<CartScreen />);
    await fireEvent.press(screen.getByTestId('cart-checkout'));

    expect(mockPush).toHaveBeenCalledWith('/checkout');
  });
});
