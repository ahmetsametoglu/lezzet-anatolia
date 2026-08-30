import { act, renderHook, waitFor } from '@testing-library/react-native';

import { meFixture } from './me-fixture';

/*
  OPERASYON KAPISI (21.97) — kabuğun hangi hâli çizeceğini söyleyen karar.

  ── BU DOSYANIN KORUDUĞU ASIL ŞEY: DÖRT HÂL, ÜÇ DEĞİL ───────────────────────
  Kapı "erişemiyor" ile "ÖĞRENEMEDİK"i ayrı tutuyor ve ayrım maliyetlidir — birleştirmek KOD
  SADELEŞTİRİR. Tam o yüzden test ediliyor: `error` dalını `denied`a katan bir "sadeleştirme"
  hiçbir yerde patlamaz, yalnız **wifi'si düşen kuryeyi vitrine düşürür** ve kimse bunu bir yetki
  hatası olarak aramaz.

  ── VE BİR GÜVENLİK HÂLİ (21.97b, cihazda ölçüldü 22.08) ────────────────────
  Kapı `/me`yi yalnız montajda okuyordu. Personel "Oturumu kapat"a bastığında çıkış GERÇEKTEN
  oluyordu ama ekran kurye rotasında kalıyordu — ölü bir oturumun rotası, paylaşılan bir cihazda
  açık duruyordu. Düğmeye "çıkınca yönlen" yazmak pansuman olurdu (aynı boşluk oturum SÜRESİ
  dolduğunda da açık kalırdı); kök sebep kapının sağır olmasıydı. Aşağıdaki `onAuthStateChange`
  testi o sağırlığın geri gelmesini yakalar.

  ── `/me` TAKLİT `fetch`LE, KAPI GERÇEK ────────────────────────────────────
  Kapının kendisi taklit edilmiyor: rolden bölüme çeviren saf kural (`operationsSectionsOf`) ve
  hâl makinesi gerçek çalışıyor. Taklit edilen tek şey tel.
*/

const mockFetchMe = jest.fn();
jest.mock('@/lib/api/me', () => ({ fetchMe: () => mockFetchMe() }));

/**
 * Depo kapsamı ucu (30.08) — kapının İKİNCİ okuması. Taklit edilen yine yalnız TEL: hangi cevabın
 * neye çevrildiği (liste, çözüm, seçim doğrulaması) gerçek kodda koşuyor.
 */
const mockFetchStaffScope = jest.fn();
jest.mock('@/lib/api/operations', () => ({ fetchStaffScope: () => mockFetchStaffScope() }));

/** Cihaz deposu (SecureStore) bu testin konusu değil; seçim doğrulaması kendi dosyasında ölçülüyor. */
jest.mock('expo-secure-store', () => ({
  getItemAsync: () => Promise.resolve(null),
  setItemAsync: () => Promise.resolve(),
  deleteItemAsync: () => Promise.resolve(),
}));

/**
 * Oturum dinleyicisi — `onAuthStateChange`in geri çağrısı burada tutuluyor ki test onu ELLE
 * tetikleyebilsin. Gerçek Supabase istemcisi `EXPO_PUBLIC_SUPABASE_*` ister ve testin konusu
 * oturum tesisatı değil, KAPI (kabuk testinin aynı gerekçesi).
 */
let authListener: (() => void) | null = null;
const mockUnsubscribe = jest.fn();
jest.mock('@/lib/auth/supabase', () => ({
  getSupabase: () => ({
    auth: {
      onAuthStateChange: (cb: () => void) => {
        authListener = cb;
        return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
      },
    },
  }),
}));

import { useOperationsAccess } from './use-operations-access.hook';

/** Uçtan gelen başarılı cevap. */
const ok = (roles: Parameters<typeof meFixture>[0], overrides = {}) => ({
  data: meFixture(roles, overrides),
  error: null,
  status: 200,
  retryAfterSec: null,
});

/** Uçtan gelen ret/arıza. `status: null` = istek hiç atılamadı (ağ yok) — 0 DEĞİL (CLAUDE §1). */
const fail = (status: number | null, error = 'hata') => ({ data: null, error, status, retryAfterSec: null });

/** Kapsam cevabı — varsayılan olarak TEK tesis (depocunun günlük hâli). */
const STR = { id: 'w-str', code: 'STR', name: 'Strasbourg Merkez', kind: 'facility' as const };
const KEHL = { id: 'w-kehl', code: 'KEHL', name: 'Kehl Depo', kind: 'facility' as const };
const scopeOk = (warehouses = [STR], resolvedId: string | null = STR.id) => ({
  data: { warehouses, resolvedId },
  error: null,
  status: 200,
  retryAfterSec: null,
});

beforeEach(() => {
  mockFetchMe.mockReset();
  mockFetchStaffScope.mockReset();
  mockFetchStaffScope.mockResolvedValue(scopeOk());
  mockUnsubscribe.mockClear();
  authListener = null;
});

async function openGate() {
  const { result } = await renderHook(() => useOperationsAccess());
  await waitFor(() => expect(result.current.status).not.toBe('loading'));
  return result;
}

describe('operasyon kapısı', () => {
  it('cevap gelene kadar YÜKLENİYOR — kabuk hiçbir şey iddia etmeden bekler', async () => {
    mockFetchMe.mockImplementation(() => new Promise(() => {}));
    const { result } = await renderHook(() => useOperationsAccess());

    expect(result.current.status).toBe('loading');
  });

  it('rolü olan personel GİRER; bölümler saf kuraldan gelir', async () => {
    mockFetchMe.mockResolvedValue(ok(['courier']));
    const result = await openGate();

    expect(result.current.status).toBe('granted');
    if (result.current.status !== 'granted') throw new Error('kapı açılmadı');
    expect(result.current.sections).toEqual(['courier']);
  });

  it('AD ve E-POSTA kapıdan gelir — ekranlar ikinci bir `/me` uçuşu yapmasın', async () => {
    // Kurye üstbaşlığı personelin adını istiyor ve o ad ZATEN bu cevabın içinde. Ayrıca okunsaydı
    // ekran başına bir uçuş ve iki cevap arasında ayrışma riski doğardı.
    mockFetchMe.mockResolvedValue(ok(['courier'], { name: 'Musa K.', email: 'musa@ornek.test' }));
    const result = await openGate();

    if (result.current.status !== 'granted') throw new Error('kapı açılmadı');
    expect(result.current.userName).toBe('Musa K.');
    expect(result.current.userEmail).toBe('musa@ornek.test');
  });

  /*
    DEPO KAPSAMI DA KAPIDAN GELİR (30.08) — beş üstbaşlık ve kapsam seçicisi aynı okumadan
    besleniyor. Ekran başına okunsaydı beş uçuş ve ayrışabilen beş cevap olurdu.
  */
  it('KAPSAM kapıdan gelir — liste ve kapının çözdüğü depo birlikte taşınır', async () => {
    mockFetchMe.mockResolvedValue(ok(['warehouse']));
    mockFetchStaffScope.mockResolvedValue(scopeOk([STR, KEHL], null));

    const result = await openGate();

    if (result.current.status !== 'granted') throw new Error('kapı açılmadı');
    expect(result.current.warehouses).toEqual([STR, KEHL]);
    // `null` = kapsam tek bir tesis değil; ekran SEÇTİRİR (kural sunucuda, burada taşınıyor).
    expect(result.current.resolvedWarehouseId).toBeNull();
  });

  it('KAPSAM OKUNAMAZSA kapı yine AÇILIR — yetki kararı `/me`nindir', async () => {
    /* Bu ayrım maliyetli ama zorunlu: bir ad okunamadı diye depocuyu vitrine düşürmek, `error`
       dalının bütün gerekçesine ters olurdu. Eksik olan yalnız üstbaşlığın kuyruğu ve seçici. */
    mockFetchMe.mockResolvedValue(ok(['warehouse']));
    mockFetchStaffScope.mockResolvedValue(fail(500, 'server_error'));

    const result = await openGate();

    expect(result.current.status).toBe('granted');
    if (result.current.status !== 'granted') throw new Error('kapı açılmadı');
    expect(result.current.warehouses).toEqual([]);
    expect(result.current.resolvedWarehouseId).toBeNull();
  });

  it('kapsam ucu MÜŞTERİ için hiç ÇAĞRILMAZ — kapıyı geçmeyene boşa istek atılmaz', async () => {
    mockFetchMe.mockResolvedValue(ok(['customer']));

    const result = await openGate();

    expect(result.current.status).toBe('denied');
    expect(mockFetchStaffScope).not.toHaveBeenCalled();
  });

  it('OTURUM YOKSA (401) reddedilir — bu KESİN bir cevaptır, arıza değil', async () => {
    mockFetchMe.mockResolvedValue(fail(401, 'unauthorized'));
    const result = await openGate();

    expect(result.current.status).toBe('denied');
  });

  it('YALNIZ MÜŞTERİ ise reddedilir — cevap geldi, bölüm yok', async () => {
    mockFetchMe.mockResolvedValue(ok([]));
    const result = await openGate();

    expect(result.current.status).toBe('denied');
  });

  it.each([
    ['ağ yok', null],
    ['sunucu arızası', 500],
    ['profil bulunamadı', 404],
  ])('%s → HATA, "yetkin yok" DEĞİL', async (_ad, status) => {
    // Kırılgan olan tam bu ayrım: `error`ı `denied`a katmak kodu sadeleştirir ve şebekesiz kuryeyi
    // sessizce vitrine düşürür. Dört hâlin üçe inmesi burada kırmızı yanar.
    mockFetchMe.mockResolvedValue(fail(status));
    const result = await openGate();

    expect(result.current.status).toBe('error');
  });

  it('`retry` YALNIZ hata hâlinde var — yüklenirken sunulan "tekrar dene" ikinci uçuş davetidir', async () => {
    mockFetchMe.mockResolvedValue(ok(['courier']));
    const acik = await openGate();
    expect('retry' in acik.current).toBe(false);

    mockFetchMe.mockResolvedValue(fail(500));
    const hatali = await openGate();
    expect('retry' in hatali.current).toBe(true);
  });

  it('`retry` gerçekten yeniden sorar ve düzelen cevapla kapı açılır', async () => {
    mockFetchMe.mockResolvedValue(fail(null));
    const result = await openGate();
    if (result.current.status !== 'error') throw new Error('hata hâli kurulamadı');

    mockFetchMe.mockResolvedValue(ok(['warehouse']));
    await act(async () => {
      if (result.current.status === 'error') result.current.retry();
    });

    await waitFor(() => expect(result.current.status).toBe('granted'));
    expect(mockFetchMe).toHaveBeenCalledTimes(2);
  });

  it('OTURUM DEĞİŞİNCE kapı YENİDEN sorulur — ölü oturumun rotası ekranda kalmasın', async () => {
    // 21.97b'nin çivisi: çıkış yapan personelin ekranı kurye rotasında kalıyordu. Kapı sağır
    // kalırsa bu test kırmızı yanar; düğmeye yazılmış bir pansuman onu yeşile döndürmez.
    mockFetchMe.mockResolvedValue(ok(['courier']));
    const result = await openGate();
    expect(result.current.status).toBe('granted');

    mockFetchMe.mockResolvedValue(fail(401, 'unauthorized'));
    await act(async () => {
      authListener?.();
    });

    await waitFor(() => expect(result.current.status).toBe('denied'));
  });

  it('ekran sökülünce dinleyici BIRAKILIR — kapı arkada sorgu biriktirmez', async () => {
    mockFetchMe.mockResolvedValue(ok(['courier']));
    const { result, unmount } = await renderHook(() => useOperationsAccess());
    await waitFor(() => expect(result.current.status).toBe('granted'));

    // RNTL v14 asenkron: sökme de bir söz döndürür ve beklenmezse temizleme efektleri henüz
    // koşmamış olur — iddia "sızıntı var" der, oysa yalnız erken bakılmıştır.
    await act(async () => {
      await unmount();
    });

    expect(mockUnsubscribe).toHaveBeenCalled();
  });
});
