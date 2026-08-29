import { choosePrinter, readPrinterChoice, resolvePrinter } from './printer-choice';

/*
  Cihaz deposu jest'te native (SecureStore) — bellek içi sahteyle değiştiriliyor. Sahte olan
  DEPO, kural değil: okuma/yazma yolunun kendisi gerçek kodda koşuyor.
*/
const mockStore = new Map<string, string>();
jest.mock('../storage/device-store', () => ({
  DEVICE_STORE_KEYS: { printerChoice: 'lezzet.printer.choice' },
  deviceStore: {
    getItem: async (key: string) => mockStore.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      mockStore.set(key, value);
    },
    removeItem: async (key: string) => {
      mockStore.delete(key);
    },
  },
}));

beforeEach(() => mockStore.clear());

/*
  YAZICI SEÇİMİ — CİHAZIN BİLGİSİ (07.12 · kullanıcı kararı 29.08).

  Çözüm kuralının üç dalı da ölçülüyor, çünkü üçü ayrı şey söylüyor:
  · seçim var ve hâlâ listede → o
  · o iş için TEK yazıcı var → o (seçenek yoksa seçim de yoktur)
  · başka her hâl → `null` ve ekran sorar; birini kendiliğinden seçmek kâğıdın hangi odadan
    çıkacağına yazılımın karar vermesi olurdu
*/

const KUTU_A = { id: 'a1', name: 'Masa', purpose: 'box' as const, address: '10.0.0.1', model: 'QL-1110NWB', labelSize: 'DieCutW103H164' };
const KUTU_B = { id: 'a2', name: 'Depo', purpose: 'box' as const, address: '10.0.0.2', model: 'QL-1110NWB', labelSize: 'DieCutW103H164' };
const KARGO = { id: 'b1', name: 'Rampa', purpose: 'shipping' as const, address: '10.0.0.9', model: 'QL-820NWB', labelSize: 'RollW62' };

describe('resolvePrinter · basımın hedefi', () => {
  it('cihazın SEÇİMİ kazanır', () => {
    expect(resolvePrinter([KUTU_A, KUTU_B], 'box', { box: 'a2' })).toBe(KUTU_B);
  });

  it('TEK yazıcı varsa seçim sorulmaz — seçenek yoksa seçim de yok', () => {
    expect(resolvePrinter([KUTU_A, KARGO], 'box', {})).toBe(KUTU_A);
    expect(resolvePrinter([KUTU_A, KARGO], 'shipping', {})).toBe(KARGO);
  });

  it('İKİ aday ve seçim yoksa `null` — kâğıdın hangi odadan çıkacağına yazılım karar vermez', () => {
    expect(resolvePrinter([KUTU_A, KUTU_B], 'box', {})).toBeNull();
  });

  it('seçilen yazıcı KAPATILMIŞSA aynı kurala düşer, sessiz yedeğe değil', () => {
    // Liste yalnız açık satırları taşıyor; kapatılan yazıcı listeden düşüyor. Kalan tekse o,
    // iki ve üzeriyse yine soru — "eskiden seçtiğine benzeyeni" bulmaya çalışmak tahmin olurdu.
    expect(resolvePrinter([KUTU_A], 'box', { box: 'silinmis' })).toBe(KUTU_A);
    expect(resolvePrinter([KUTU_A, KUTU_B], 'box', { box: 'silinmis' })).toBeNull();
  });

  it('AMAÇ karışmaz — kargo etiketi kutu yazıcısına düşmez (ayrım fiziksel)', () => {
    expect(resolvePrinter([KUTU_A], 'shipping', {})).toBeNull();
  });
});

describe('seçimin kalıcılığı', () => {
  it('iki İŞ ayrı ayrı saklanır — biri ötekini ezmez', async () => {
    await choosePrinter('box', KUTU_A.id);
    await choosePrinter('shipping', KARGO.id);
    expect(await readPrinterChoice()).toEqual({ box: KUTU_A.id, shipping: KARGO.id });
  });

  it('bozuk kayıt seçimi SIFIRLAR, tahmin etmez', async () => {
    mockStore.set('lezzet.printer.choice', '{bozuk');
    // Sessiz değil: çağıran `null` alır ve ekran seçim sorar. Okunamayan bir tercihi tahmin
    // etmek, kâğıdı yanlış odaya yollamaktan daha kötü bir sessizlik olurdu.
    expect(await readPrinterChoice()).toEqual({});
  });
});
