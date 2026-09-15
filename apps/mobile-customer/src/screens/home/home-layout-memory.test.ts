/*
  VİTRİN YERLEŞİM İZİ — SecureStore yerine bellek haritası; her test modülü TAZE yükler çünkü
  bellek yansıması (snapshot) modül düzeyinde yaşıyor (onboarding deposu testinin aynı kurulumu).

  OKUMA ABONELİKTEN SINANIR: izin dış kapısı `subscribeHomeLayout` + `getHomeLayoutSnapshot`
  ikilisidir (diski okuyan fonksiyon bilerek dışarı açılmadı — künyesi). `freshStore()` modülü
  yeniden değerlendirir; bellek haritası korunduğu için bu "aynı cihaz, YENİ açılış" demektir —
  izin asıl sınandığı senaryo da budur.
*/

import type * as HomeLayoutMemoryModule from './home-layout-memory';

type Store = typeof HomeLayoutMemoryModule;

const mockMemory = new Map<string, string>();
const mockGetItemAsync = jest.fn(async (key: string): Promise<string | null> => mockMemory.get(key) ?? null);
const mockSetItemAsync = jest.fn(async (key: string, value: string): Promise<void> => {
  mockMemory.set(key, value);
});

jest.mock('expo-secure-store', () => ({
  getItemAsync: (key: string) => mockGetItemAsync(key),
  setItemAsync: (key: string, value: string) => mockSetItemAsync(key, value),
  deleteItemAsync: jest.fn(async (): Promise<void> => undefined),
}));

let store: Store;

/** Mikro görev kuyruğunu boşaltır — abonelikle tetiklenen okuma yayınını bekletmek için. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** "Yeni açılış": modül taze değerlendirilir, cihaz deposu (mockMemory) yerinde kalır. */
function freshStore(): Store {
  jest.resetModules();
  return jest.requireActual<Store>('./home-layout-memory');
}

/** Bir açılışın gördüğü izi döndürür — depo okunana kadar bekler. */
async function bootAndRead(target: Store = store) {
  target.subscribeHomeLayout(jest.fn());
  await flush();
  return target.getHomeLayoutSnapshot();
}

/** Varsayılandan farklı, tanınabilir bir iz. */
const layout = {
  orderBand: true,
  flash: false,
  offers: 1,
  bands: 4,
  featured: 3,
  recipes: 2,
  packages: 1,
};

beforeEach(() => {
  mockMemory.clear();
  mockGetItemAsync.mockClear();
  mockSetItemAsync.mockClear();
  store = freshStore();
});

describe('vitrin yerleşim izi', () => {
  it('kayıt yokken null döner — skeleton varsayılan yerleşimi çizer', async () => {
    await expect(bootAndRead()).resolves.toBeNull();
  });

  it('varsayılan yerleşim uç sözleşmesinin tavanlarını taşır, sipariş bandını taşımaz', () => {
    expect(store.DEFAULT_HOME_LAYOUT).toEqual({
      orderBand: false,
      flash: false,
      offers: 2,
      bands: 6,
      featured: 4,
      recipes: 3,
      packages: 2,
    });
  });

  it('kaydedilen iz SONRAKİ açılışta aynen okunur; tek anahtar altında tek JSON yazılır', async () => {
    await store.saveHomeLayout(layout);

    expect(mockSetItemAsync).toHaveBeenCalledTimes(1);
    expect(mockSetItemAsync).toHaveBeenCalledWith('lezzet.home.layout', JSON.stringify(layout));
    await expect(bootAndRead(freshStore())).resolves.toEqual(layout);
  });

  it('DEĞİŞMEYEN iz ikinci kez diske yazılmaz — vitrin her yüklemede çağırıyor', async () => {
    await store.saveHomeLayout(layout);
    await store.saveHomeLayout({ ...layout });

    expect(mockSetItemAsync).toHaveBeenCalledTimes(1);
  });

  it('tek alanı değişen iz yeniden yazılır', async () => {
    await store.saveHomeLayout(layout);
    await store.saveHomeLayout({ ...layout, packages: 0 });

    expect(mockSetItemAsync).toHaveBeenCalledTimes(2);
    expect(store.getHomeLayoutSnapshot()).toEqual({ ...layout, packages: 0 });
  });

  it('bozuk JSON "kayıt yok" sayılır, uygulama kararmaz', async () => {
    mockMemory.set('lezzet.home.layout', '{bozuk');
    await expect(bootAndRead()).resolves.toBeNull();
  });

  it('şemaya uymayan kayıt "kayıt yok" sayılır (eski sürüm ya da bozulmuş sayı)', async () => {
    mockMemory.set('lezzet.home.layout', JSON.stringify({ ...layout, bands: -1 }));
    await expect(bootAndRead()).resolves.toBeNull();
  });

  it('makul olmayan büyüklükteki sayı reddedilir — skeleton ekran boyu griye dönmez', async () => {
    mockMemory.set('lezzet.home.layout', JSON.stringify({ ...layout, bands: 1000 }));
    await expect(bootAndRead()).resolves.toBeNull();
  });

  it('depo okuma arızası "kayıt yok" sayılır', async () => {
    mockMemory.set('lezzet.home.layout', JSON.stringify(layout));
    mockGetItemAsync.mockRejectedValueOnce(new Error('keychain arızası'));

    await expect(bootAndRead()).resolves.toBeNull();
  });

  it('yazma düşse bile bellek yansıması güncellenir — aynı oturumun ikinci skeleton’ı taze izi görür', async () => {
    mockSetItemAsync.mockRejectedValueOnce(new Error('disk dolu'));
    const listener = jest.fn();
    store.subscribeHomeLayout(listener);

    await store.saveHomeLayout(layout);

    expect(store.getHomeLayoutSnapshot()).toEqual(layout);
    expect(listener).toHaveBeenCalled();
  });

  it('ilk abonelik depoyu BİR KEZ okur ve kayıtlı izi yayınlar', async () => {
    mockMemory.set('lezzet.home.layout', JSON.stringify(layout));

    const listener = jest.fn();
    store.subscribeHomeLayout(listener);
    store.subscribeHomeLayout(jest.fn());
    await flush();

    expect(store.getHomeLayoutSnapshot()).toEqual(layout);
    expect(listener).toHaveBeenCalled();
    expect(mockGetItemAsync).toHaveBeenCalledTimes(1);
  });

  it('okuma sürerken yazılan iz eski disk değeriyle EZİLMEZ (yarış)', async () => {
    mockMemory.set('lezzet.home.layout', JSON.stringify({ ...layout, bands: 6 }));
    store.subscribeHomeLayout(jest.fn());

    await store.saveHomeLayout(layout);
    await flush();

    expect(store.getHomeLayoutSnapshot()).toEqual(layout);
  });
});
