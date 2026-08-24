/*
  POSTA KODUNUN ÇÖZÜLMÜŞ YER ADI — cihaz-yerel bellek (21.101 · MB-80).

  ── BU TESTİN KORUDUĞU ŞEY ──────────────────────────────────────────────────
  Belleğin işi vitrin başlığındaki *"67000"* karesini kapatmak. Bozulduğunda hiçbir yer hata
  vermez — başlık yalnız eski davranışına, çıplak koda düşer ve kimse bunu bir arıza olarak
  görmez. Yani düzeltmenin kendisi, geri gittiğinde SESSİZ olan bir düzeltme.

  Üç kural çiviliyoruz, üçü de "bayat bilgi göstermektense hiçbir şey gösterme" ekseninde:
    1. Kayıt KODA bağlıdır — kod değişince eski ad kullanılmaz.
    2. Bozuk/eksik kayıt "kayıt yok" sayılır, uygulama kararmaz.
    3. Okuma sürerken yazılan taze ad, geç gelen disk cevabıyla EZİLMEZ.

  Üçüncüsü bu dosya yazılırken ÜRETİLDİ ve gerçek bir arızaydı (24.08): `subscribe` diski
  `.then(publish)` ile KOŞULSUZ yayınlıyordu, yani `/places` cevabı diskten önce gelirse taze ad
  eski değerle geri alınıyordu — tam olarak MB-80'in kapattığı karenin geri gelmesi. Kardeş modül
  (`home-layout-memory`) aynı yarışı `snapshot === undefined` koşuluyla zaten kapatmıştı ve künye
  onu emsal gösteriyordu; koruma kopyalanmamıştı. Önce test yazıldı, sonra düzeltildi.

  ── HOOK GERÇEKTEN RENDER EDİLİYOR ──────────────────────────────────────────
  Modülün dış kapısı `useRememberedPlaceName`; abonelik ve yansıma DIŞARI AÇILMADI. Sınamak için
  onları export etmek, testin rahatlığı uğruna modülün yüzeyini genişletmek olurdu. `renderHook`
  gerçek kapıyı çalıyor — üstelik `useSyncExternalStore` aboneliğinin sökülmesi de böyle kapsanıyor.

  ── "YENİ AÇILIŞ" `resetModules` İLE KURULMAZ ───────────────────────────────
  Kardeş test (`home-layout-memory`) modülü `jest.resetModules()` ile taze yüklüyor ve orada bu
  doğru: o modül düz fonksiyonlardan ibaret. Burada HOOK var ve taze yüklenen modül kendi React
  nüshasını çekiyor — render eden React başka, hook'un çağırdığı React başka olunca dispatcher
  `null` kalıyor ve on iki test *"Cannot read properties of null (reading 'useSyncExternalStore')"*
  diye düşüyor (ölçüldü 24.08).

  Doğru kapı modülün kendi `resetPlaceNameMemory`si: yansımayı, okuma bayrağını ve dinleyicileri
  sıfırlar — cihaz deposuna dokunmaz. Yani tam olarak "aynı cihaz, YENİ açılış". Fonksiyon zaten
  bu iş için yazılmıştı ve bugüne kadar HİÇ çağrılmıyordu (ölü ihracat); testi gelince amacına
  kavuştu.
*/

import { act, renderHook } from '@testing-library/react-native';

import { rememberPlaceName, resetPlaceNameMemory, useRememberedPlaceName } from './place-name-memory';

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

const KEY = 'lezzet.place.name';
const KAYIT = (code: string, name: string) => JSON.stringify({ code, name });

/** Mikro görev kuyruğunu boşaltır — abonelikle tetiklenen disk okumasının yayınını beklemek için. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Disk okumasını ASKIDA tutar — cevabın ne zaman geleceğine test karar verir.
 *
 * **Bu olmadan yarış testi SAHTE YEŞİL veriyor** (ölçüldü 24.08): `renderHook` beklenirken mikro
 * görev kuyruğu zaten boşalıyor, yani disk cevabı yazımdan ÖNCE geliyor ve yarış hiç kurulmuyor.
 * Test geçiyordu — korumasız kodda bile. Sınamak istediğin sırayı kurmadan yazılan bir iddia,
 * kendini doğrulamayan bir iddiadır (aynı tuzağa MB-40 sondasında düşülmüştü).
 */
function deferRead(): { resolve: (raw: string | null) => void } {
  let release!: (raw: string | null) => void;
  mockGetItemAsync.mockImplementationOnce(() => new Promise<string | null>((r) => (release = r)));
  return { resolve: (raw) => release(raw) };
}

/**
 * Bir açılışın bu kod için gördüğü ad.
 *
 * `act` + `flush` ikilisi ZORUNLU ve iddianın geçerliliği buna bağlı: disk okuması abonelikle
 * başlıyor, yani render'dan HEMEN sonra bakılan değer her senaryoda `null` olurdu ve "kayıt yok"
 * testleri boşluğa geçerdi (sahte yeşil). Beklemeden sonra okunan değer nihai değerdir.
 */
async function nameFor(code: string | null): Promise<string | null> {
  const { result } = await renderHook(() => useRememberedPlaceName(code));
  await act(async () => {
    await flush();
  });
  return result.current;
}

beforeEach(() => {
  mockMemory.clear();
  mockGetItemAsync.mockClear();
  mockSetItemAsync.mockClear();
  resetPlaceNameMemory();
});

describe('yer adı belleği', () => {
  it('kayıt yokken ad da yok — başlık çıplak kodu yazar', async () => {
    await expect(nameFor('67000')).resolves.toBeNull();
  });

  it('kaydedilen ad SONRAKİ açılışta okunur; tek anahtar altında tek JSON', async () => {
    await rememberPlaceName('67000', 'STRASBOURG');

    expect(mockSetItemAsync).toHaveBeenCalledTimes(1);
    expect(mockSetItemAsync).toHaveBeenCalledWith(KEY, KAYIT('67000', 'STRASBOURG'));

    // "Yeni açılış": bellek sıfırlanır, cihaz deposu yerinde kalır. Okunan ad DİSKTEN gelir —
    // sıfırlamasaydık bellekteki yansımayı ölçerdik ve kalıcılık hiç sınanmamış olurdu.
    resetPlaceNameMemory();
    await expect(nameFor('67000')).resolves.toBe('STRASBOURG');
  });

  it('KOD DEĞİŞTİYSE eski ad kullanılmaz — bayat şehir yeni kodun yanında görünmez', async () => {
    mockMemory.set(KEY, KAYIT('67000', 'STRASBOURG'));

    await expect(nameFor('68000')).resolves.toBeNull();
    await expect(nameFor('67000')).resolves.toBe('STRASBOURG');
  });

  it('kod HENÜZ yoksa ad sorulmaz', async () => {
    mockMemory.set(KEY, KAYIT('67000', 'STRASBOURG'));

    await expect(nameFor(null)).resolves.toBeNull();
  });

  it('AYNI kayıt ikinci kez diske yazılmaz — vitrin her açılışta çağırıyor', async () => {
    await rememberPlaceName('67000', 'STRASBOURG');
    await rememberPlaceName('67000', 'STRASBOURG');

    expect(mockSetItemAsync).toHaveBeenCalledTimes(1);
  });

  it('adı DEĞİŞEN kayıt yeniden yazılır', async () => {
    await rememberPlaceName('67000', 'STRASBOURG');
    await rememberPlaceName('67000', 'Strasbourg');

    expect(mockSetItemAsync).toHaveBeenCalledTimes(2);
    await expect(nameFor('67000')).resolves.toBe('Strasbourg');
  });

  it('BOŞ kod ya da BOŞ ad hiç yazılmaz — çözülmemiş yer kayda geçmez', async () => {
    // `ambiguous_zone` gibi hâllerde çözülmüş bir ad yoktur; boş dize yazmak, başlıkta kodun
    // yanına hiçbir şey eklemeyen bir "kayıt var" hâli doğururdu.
    await rememberPlaceName('', 'STRASBOURG');
    await rememberPlaceName('67000', '');

    expect(mockSetItemAsync).not.toHaveBeenCalled();
  });

  it('bozuk JSON "kayıt yok" sayılır, uygulama kararmaz', async () => {
    mockMemory.set(KEY, '{bozuk');

    await expect(nameFor('67000')).resolves.toBeNull();
  });

  it('şemaya uymayan kayıt "kayıt yok" sayılır (eski sürüm ya da bozulmuş satır)', async () => {
    mockMemory.set(KEY, JSON.stringify({ code: '67000' }));

    await expect(nameFor('67000')).resolves.toBeNull();
  });

  it('depo okuma arızası "kayıt yok" sayılır', async () => {
    mockMemory.set(KEY, KAYIT('67000', 'STRASBOURG'));
    mockGetItemAsync.mockRejectedValueOnce(new Error('keychain arızası'));

    await expect(nameFor('67000')).resolves.toBeNull();
  });

  it('ilk abonelik depoyu BİR KEZ okur — iki ekran birden bakabilir', async () => {
    mockMemory.set(KEY, KAYIT('67000', 'STRASBOURG'));

    const ilk = await renderHook(() => useRememberedPlaceName('67000'));
    const ikinci = await renderHook(() => useRememberedPlaceName('67000'));
    await act(async () => {
      await flush();
    });

    expect(mockGetItemAsync).toHaveBeenCalledTimes(1);
    expect(ilk.result.current).toBe('STRASBOURG');
    expect(ikinci.result.current).toBe('STRASBOURG');
  });

  it('YAZMA düşse bile bu oturum adı görür — kayıp olan tek şey sonraki açılışın rahatlığı', async () => {
    mockSetItemAsync.mockRejectedValueOnce(new Error('disk dolu'));
    const { result } = await renderHook(() => useRememberedPlaceName('67000'));

    await act(async () => {
      await rememberPlaceName('67000', 'STRASBOURG');
      await flush();
    });

    expect(result.current).toBe('STRASBOURG');
  });

  it('OKUMA SÜRERKEN yazılan taze ad, geç gelen disk cevabıyla EZİLMEZ (yarış)', async () => {
    // Arızanın kendisi: `/places` cevabı diskten önce gelirse taze ad geri alınıyor ve başlık
    // MB-80'in kapattığı çıplak kod karesine düşüyordu.
    const disk = deferRead();
    const { result } = await renderHook(() => useRememberedPlaceName('67000'));

    await act(async () => {
      await rememberPlaceName('67000', 'STRASBOURG');
    });
    expect(result.current).toBe('STRASBOURG');

    // Disk ŞİMDİ cevap veriyor — ve eski adı taşıyor. Koruma yoksa burada geri alınır.
    await act(async () => {
      disk.resolve(KAYIT('67000', 'ESKİ'));
      await flush();
    });

    expect(result.current).toBe('STRASBOURG');
  });

  it('okuma sürerken BAŞKA kodun adı yazılırsa disk cevabı yine ezmez', async () => {
    // Aynı yarışın müşteri kodunu değiştirdiği hâli — burada eski kaydın geri gelmesi daha da
    // kötü: başlıkta YANLIŞ şehir görünürdü, eksik değil.
    const disk = deferRead();
    const { result } = await renderHook(() => useRememberedPlaceName('68000'));

    await act(async () => {
      await rememberPlaceName('68000', 'COLMAR');
    });

    await act(async () => {
      disk.resolve(KAYIT('67000', 'STRASBOURG'));
      await flush();
    });

    expect(result.current).toBe('COLMAR');
  });

  it('disk cevabı ÖNCE gelirse kayıt normal okunur — koruma taze yazımı beklemez', async () => {
    // Yarış korumasının ters yüzü: `snapshot === undefined` koşulu, yazım OLMADIĞI hâlde diskin
    // yayınlanmasını engellememeli. Bu iki test birlikte, korumanın hangi yönde çalıştığını söyler.
    const disk = deferRead();
    const { result } = await renderHook(() => useRememberedPlaceName('67000'));

    await act(async () => {
      disk.resolve(KAYIT('67000', 'STRASBOURG'));
      await flush();
    });

    expect(result.current).toBe('STRASBOURG');
  });
});
