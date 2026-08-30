import { env } from './env';

/*
  YEREL ADRESİN HOST'U (30.08) — cihaz başına doğru, ve tahminsiz.

  Ölçülmüş arızanın nöbetçisi: iOS FİZİKSEL cihazda `localhost` telefonun kendisidir ve ürünler
  gelmiyordu ("bağlantı yok" deniyordu, oysa her şey ayaktaydı). `adb reverse` köprüsü Android'in
  aracı; iOS'ta karşılığı yok. LAN IP'yi elle yazmak da çözüm değildi — router IP'yi değiştirdiği
  gün sessizce kopuyordu (ölçüldü 27.08: `192.168.1.161` → `.130`).

  Kural: host TAHMİN EDİLMEZ, cihazın Metro'ya ulaştığı adresten OKUNUR.

  ── MODÜL YENİDEN YÜKLENMİYOR, VE BU KAPININ KENDİ TASARIMI ─────────────────
  `env`in üçü de getter ve hepsi ÇAĞRI ANINDA okuyor (dosyanın kendi künyesi bunu söylüyor).
  Yani tek bir içe aktarma yeter; `jest.resetModules()`+`require` sarmalı, olmayan bir sorunun
  makinesi olurdu.
*/
const mockConstants: { expoConfig: { hostUri?: string } | null } = { expoConfig: null };
/*
  `__esModule: true` ŞART ve unutulunca sessizce yanıltıyor (yaşandı 30.08): Babel'in interop'u
  bayrağı görmezse nesneyi bir kat daha sarıyor (`{ default: mock }`), `Constants.expoConfig`
  `undefined` kalıyor ve test "çeviri yapılmadı" diye KIRMIZI oluyor — kod doğruyken. Yanlış
  yönde bir teşhis üretiyor, çünkü hata koddaymış gibi görünüyor.
*/
jest.mock('expo-constants', () => ({
  __esModule: true,
  get default() {
    return mockConstants;
  },
}));

/** `__DEV__` React Native'in küresel bayrağı; testte yazmak için tipli bir kapı gerekiyor. */
const bayraklar = globalThis as unknown as { __DEV__: boolean };
const gercekDev = bayraklar.__DEV__;

beforeEach(() => {
  mockConstants.expoConfig = null;
  bayraklar.__DEV__ = true;
  process.env.EXPO_PUBLIC_API_URL = 'http://localhost:3002';
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
  process.env.EXPO_PUBLIC_SUPABASE_KEY = 'sb_publishable_test';
});

afterAll(() => {
  bayraklar.__DEV__ = gercekDev;
});

describe('yerel adresin host çözümü', () => {
  it('iOS FİZİKSEL cihaz: host makinenin LAN adresiyle değişir, port korunur', () => {
    // Telefon Metro'ya bu adresten bağlandı; aynı makinedeki API ve Supabase de orada.
    mockConstants.expoConfig = { hostUri: '192.168.1.161:8081' };

    expect(env.apiUrl).toBe('http://192.168.1.161:3002');
    expect(env.supabaseUrl).toBe('http://192.168.1.161:54321');
  });

  it('iOS SİMÜLATÖRÜ ve adb reverse’li ANDROID: `localhost` aynen kalır — köprü bozulmaz', () => {
    mockConstants.expoConfig = { hostUri: 'localhost:8081' };

    expect(env.apiUrl).toBe('http://localhost:3002');
    expect(env.supabaseUrl).toBe('http://localhost:54321');
  });

  it('geliştirme sunucusuna bağlı DEĞİLSE değişkenin kendi değeri kullanılır', () => {
    // Yayınlanmış derlemenin normal hâli: `hostUri` boş, gömülü adres aynen geçerli.
    mockConstants.expoConfig = { hostUri: undefined };

    expect(env.apiUrl).toBe('http://localhost:3002');
  });

  it('ÜRETİM derlemesinde cihaz bilgisi hiç okunmaz — müşteri bizim makinemizi aramaz', () => {
    bayraklar.__DEV__ = false;
    // Üretimde bir şekilde dolu gelen `hostUri` uygulamayı geliştirme makinesine yönlendirirdi.
    mockConstants.expoConfig = { hostUri: '192.168.1.161:8081' };

    expect(env.apiUrl).toBe('http://localhost:3002');
  });

  it('GERÇEK alan adına dokunulmaz — bilerek yazılan hedef sessizce değiştirilmez', () => {
    // Sahne ortamına bakan bir geliştirme derlemesi: ölçtüğü şey ölçmek istediği şey kalmalı.
    process.env.EXPO_PUBLIC_API_URL = 'https://api.lezzetanatolia.fr';
    mockConstants.expoConfig = { hostUri: '192.168.1.161:8081' };

    expect(env.apiUrl).toBe('https://api.lezzetanatolia.fr');
  });

  it('127.0.0.1 de yerel sayılır — iki yazılış aynı şeyi anlatıyor', () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://127.0.0.1:3002';
    mockConstants.expoConfig = { hostUri: '192.168.1.161:8081' };

    expect(env.apiUrl).toBe('http://192.168.1.161:3002');
  });

  it('adres BENZERİ bir host korunur — `localhost-staging` yerel değildir', () => {
    // Kalıbın sınırı: eşleşme host'un BİTTİĞİ yeri de görmeli, yoksa ön eki paylaşan başka bir
    // makine sessizce bizimkine çevrilirdi.
    process.env.EXPO_PUBLIC_API_URL = 'http://localhost-staging:3002';
    mockConstants.expoConfig = { hostUri: '192.168.1.161:8081' };

    expect(env.apiUrl).toBe('http://localhost-staging:3002');
  });

  it('değişken EKSİKSE gürültülü patlar — sessiz undefined bir arızayı gizlerdi', () => {
    delete process.env.EXPO_PUBLIC_API_URL;

    expect(() => env.apiUrl).toThrow(/EXPO_PUBLIC_API_URL tanımsız/);
  });
});
