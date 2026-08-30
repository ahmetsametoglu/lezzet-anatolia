/*
  ÇALIŞILAN DEPONUN SEÇİMİ — cihaz deposu taklit, kural gerçek.

  Çivilenen dört karar:
   1. Seçim yokken adres AYNEN gider — tek depolu personelde hiçbir şey değişmez (kimlik jetondan
      çözülür, `warehouseGuard`ın birinci hâli).
   2. Seçim varken adrese `?warehouseId=` yazılır; adreste zaten sorgu varsa `&` ile eklenir —
      `?` ile eklemek `q=`/`locale=` gibi parametreleri sessizce yutardı.
   3. Cihazdaki seçim KAPSAMA karşı doğrulanır: kapsamdan düşen kimlik temizlenir. Doğrulanmasaydı
      her istek `403 warehouse_out_of_scope`a çarpar ve ekranda sebebi hiçbir yerde yazmayan bir
      duvar olurdu.
   4. Cihaz deposu DÜŞERSE seçim yok sayılır — hata yutulmuyor, ekranın yeniden sormasına
      çevriliyor.
*/

/* `mock` ÖNEKİ ZORUNLU: `jest.mock` fabrikası dosyanın tepesine taşınıyor ve kendi kapsamı
   dışındaki değişkenleri yalnız bu önekle görebiliyor (`home-layout-memory.test` aynı kurulum). */
const mockStore = new Map<string, string>();
/** Cihaz deposunun DÜŞTÜĞÜ hâl — okunamayan depo "seçim yok" demektir, çökme değil. */
let mockFails = false;

jest.mock('expo-secure-store', () => ({
  getItemAsync: (key: string) =>
    mockFails ? Promise.reject(new Error('depo okunamadı')) : Promise.resolve(mockStore.get(key) ?? null),
  setItemAsync: (key: string, value: string) => {
    mockStore.set(key, value);
    return Promise.resolve();
  },
  deleteItemAsync: (key: string) => {
    mockStore.delete(key);
    return Promise.resolve();
  },
}));

import { DEVICE_STORE_KEYS } from '../storage/device-store';
import {
  chooseWarehouse,
  chosenWarehouseId,
  clearWarehouseChoice,
  loadWarehouseChoice,
  resetWarehouseChoice,
  withWarehouseChoice,
} from './warehouse-choice';

const STR = 'w-str';
const KEHL = 'w-kehl';

beforeEach(() => {
  mockStore.clear();
  mockFails = false;
  resetWarehouseChoice();
});

describe('seçim yokken', () => {
  it('adres AYNEN gider — tek depolu personelde hiçbir şey değişmez', () => {
    expect(withWarehouseChoice('/api/v1/warehouse/preparation')).toBe('/api/v1/warehouse/preparation');
    expect(chosenWarehouseId()).toBeNull();
  });
});

describe('seçim varken', () => {
  it('sorgusuz adrese `?` ile, sorgulu adrese `&` ile eklenir', () => {
    chooseWarehouse(STR);

    expect(withWarehouseChoice('/api/v1/warehouse/preparation')).toBe(
      `/api/v1/warehouse/preparation?warehouseId=${STR}`,
    );
    // Mevcut parametre YUTULMAZ: arama sorgusu ile depo kimliği aynı adreste yaşar.
    expect(withWarehouseChoice('/api/v1/warehouse/variants?q=bal')).toBe(
      `/api/v1/warehouse/variants?q=bal&warehouseId=${STR}`,
    );
  });

  it('seçim cihaza da yazılır — uygulama yeniden açılınca sorulmaz', async () => {
    chooseWarehouse(KEHL);
    // Kalıcılık arkadan yazılıyor (seçim SENKRON dönüyor); söz sırası boşalınca kayıt yerinde.
    await Promise.resolve();

    expect(mockStore.get(DEVICE_STORE_KEYS.warehouseChoice)).toBe(KEHL);
  });
});

describe('kapıdaki doğrulama', () => {
  it('cihazdaki seçim kapsamdaysa YÜKLENİR', async () => {
    mockStore.set(DEVICE_STORE_KEYS.warehouseChoice, KEHL);

    await loadWarehouseChoice([STR, KEHL]);

    expect(chosenWarehouseId()).toBe(KEHL);
  });

  it('kapsamdan DÜŞEN seçim temizlenir — 403 duvarı yerine yeniden sorulur', async () => {
    mockStore.set(DEVICE_STORE_KEYS.warehouseChoice, KEHL);

    // Yönetici personeli başka tesise aldı: eski kimlik artık kapsamda değil.
    await loadWarehouseChoice([STR]);

    expect(chosenWarehouseId()).toBeNull();
    expect(mockStore.has(DEVICE_STORE_KEYS.warehouseChoice)).toBe(false);
  });

  it('cihaz deposu okunamazsa seçim YOK sayılır — ekran sorar', async () => {
    mockFails = true;

    await loadWarehouseChoice([STR, KEHL]);

    expect(chosenWarehouseId()).toBeNull();
  });
});

describe('depo değiştir', () => {
  it('seçimi bırakır — bellekten de cihazdan da', async () => {
    chooseWarehouse(STR);
    await Promise.resolve();

    clearWarehouseChoice();
    await Promise.resolve();

    expect(chosenWarehouseId()).toBeNull();
    expect(mockStore.has(DEVICE_STORE_KEYS.warehouseChoice)).toBe(false);
  });
});
