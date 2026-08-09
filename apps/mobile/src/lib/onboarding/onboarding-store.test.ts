/*
  ONBOARDING DEPOSU — SecureStore yerine bellek haritası; her test modülü TAZE yükler çünkü
  bellek yansıması (snapshot) modül düzeyinde yaşıyor ve testler birbirinin durumunu görmemeli.
*/

// Tip statik (silinir), örnek `requireActual`dan taze gelir — ikisi ayrı kanal, çakışmazlar.
// `readOnboarding` DURUMSUZDUR (saf depo okuması): statik bağ ile taze örnek aynı davranışı verir,
// o yüzden bir test onu bilerek statik kanaldan sınıyor (dış tüketicisinin okuyacağı kapı bu).
import { readOnboarding } from './onboarding-store';
import type * as OnboardingStoreModule from './onboarding-store';

type Store = typeof OnboardingStoreModule;

const mockMemory = new Map<string, string>();
const mockGetItemAsync = jest.fn(async (key: string): Promise<string | null> => mockMemory.get(key) ?? null);
const mockSetItemAsync = jest.fn(async (key: string, value: string): Promise<void> => {
  mockMemory.set(key, value);
});

jest.mock('expo-secure-store', () => ({
  getItemAsync: (key: string) => mockGetItemAsync(key),
  setItemAsync: (key: string, value: string) => mockSetItemAsync(key, value),
}));

let store: Store;

/** Mikro görev kuyruğunu boşaltır — abonelikle tetiklenen okuma yayınını bekletmek için. */
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  jest.resetModules();
  mockMemory.clear();
  mockGetItemAsync.mockClear();
  mockSetItemAsync.mockClear();
  // `import()` bu Jest kurulumunda VM modül bayrağı ister; kayıt sıfırlandıktan sonra taze
  // değerlendirme `requireActual` ile alınır (modül zaten mock'lanmıyor, "actual" = kendisi).
  store = jest.requireActual<Store>('./onboarding-store');
});

describe('onboarding deposu', () => {
  it('kayıt yokken null döner (ilk açılış)', async () => {
    await expect(store.readOnboarding()).resolves.toBeNull();
  });

  it('kaydedilen durum aynen geri okunur; tek anahtar altında tek JSON yazılır', async () => {
    const state = { done: true, locale: 'fr' as const, postalCode: '67000' };
    await store.saveOnboarding(state);

    // Statik kanal: dışarıdan içe aktaran bir tüketicinin göreceği davranışın kendisi.
    await expect(readOnboarding()).resolves.toEqual(state);
    expect(mockSetItemAsync).toHaveBeenCalledTimes(1);
    expect(mockSetItemAsync).toHaveBeenCalledWith('lezzet.onboarding', JSON.stringify(state));
  });

  it('posta kodu yazılmadıysa null saklanır ve null döner', async () => {
    await store.saveOnboarding({ done: true, locale: 'tr', postalCode: null });
    await expect(store.readOnboarding()).resolves.toEqual({ done: true, locale: 'tr', postalCode: null });
  });

  it('bozuk JSON "kayıt yok" sayılır, fırlatmaz', async () => {
    mockMemory.set('lezzet.onboarding', '{bozuk');
    await expect(store.readOnboarding()).resolves.toBeNull();
  });

  it('şemaya uymayan kayıt "kayıt yok" sayılır (eski/yabancı sürüm)', async () => {
    mockMemory.set('lezzet.onboarding', JSON.stringify({ done: 'evet', locale: 'xx' }));
    await expect(store.readOnboarding()).resolves.toBeNull();
  });

  it('depo okuma arızası "kayıt yok" sayılır — uygulama kararmaz', async () => {
    mockGetItemAsync.mockRejectedValueOnce(new Error('keychain arızası'));
    await expect(store.readOnboarding()).resolves.toBeNull();
  });

  it('yazma düşse bile bellek yansıması güncellenir — kapı aynı oturumda geri sekmez', async () => {
    mockSetItemAsync.mockRejectedValueOnce(new Error('disk dolu'));
    const listener = jest.fn();
    store.subscribeOnboarding(listener);

    const state = { done: true, locale: 'de' as const, postalCode: null };
    await store.saveOnboarding(state);

    expect(store.getOnboardingSnapshot()).toEqual(state);
    expect(listener).toHaveBeenCalled();
  });

  it('ilk abonelik depoyu bir kez okur ve kayıtlı durumu yayınlar', async () => {
    const state = { done: true, locale: 'fr' as const, postalCode: '75001' };
    mockMemory.set('lezzet.onboarding', JSON.stringify(state));

    const listener = jest.fn();
    store.subscribeOnboarding(listener);
    store.subscribeOnboarding(jest.fn());
    await flush();

    expect(store.getOnboardingSnapshot()).toEqual(state);
    expect(listener).toHaveBeenCalled();
    // İkinci abone ikinci bir okuma başlatmaz — bayrak cihaz ömrü boyunca sabit.
    expect(mockGetItemAsync).toHaveBeenCalledTimes(1);
  });

  it('okuma sürerken yazılan kayıt eski disk değeriyle EZİLMEZ (yarış)', async () => {
    mockMemory.set('lezzet.onboarding', JSON.stringify({ done: false, locale: 'tr', postalCode: null }));
    store.subscribeOnboarding(jest.fn());

    const fresh = { done: true, locale: 'tr' as const, postalCode: '67100' };
    await store.saveOnboarding(fresh);
    await flush();

    expect(store.getOnboardingSnapshot()).toEqual(fresh);
  });
});
