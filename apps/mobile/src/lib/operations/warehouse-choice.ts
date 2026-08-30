import { useSyncExternalStore } from 'react';

import { DEVICE_STORE_KEYS, deviceStore } from '../storage/device-store';

/*
  ÇALIŞILAN DEPONUN SEÇİMİ — CİHAZIN BİLGİSİ (kullanıcı bulgusu 30.08).

  ── ÖLÇÜLEN ARIZA ───────────────────────────────────────────────────────────
  Kapsamı iki tesisli personel (`hepsi@lezzetanatolia.fr` → str + van) Depo sekmesinde "hangi
  depoda çalıştığın belli değil" bloğuna düşüyordu ve **çıkış yolu yoktu.** Kapı doğru
  davranıyordu (`warehouseGuard`: *"kapsamda tek depo varsa o, değilse söylenmeli"*), ekran da
  dürüsttü — eksik olan tek şey CEVABIN KENDİSİYDİ: personelin depolarının listesi mobile hiç
  ulaşmıyordu. Liste geldi (`/operations/scope`), cevabı da bu dosya saklıyor.

  ── "VARSAYILAN DEPO YOKTUR" DEĞİŞMEDİ ──────────────────────────────────────
  CLAUDE §1'in kuralı seçimin kendiliğinden YAPILMAMASIDIR, seçilememesi değil. Burada hiçbir şey
  tahmin edilmiyor: seçim personelin AÇIK eylemidir, kapsamına karşı doğrulanır ve her istekte
  sunucu tarafından yeniden sınanır (`?warehouseId=` kapsam dışıysa `403`). Yani seçim bir
  ÖNERİDİR; yetkiyi hâlâ kapı verir.

  ── NEDEN CİHAZDA, SUNUCUDA DEĞİL ───────────────────────────────────────────
  Yazıcı seçimiyle aynı ayrım (`lib/print/printer-choice.ts`): envanter sunucunun, tercih cihazın.
  Sunucuda tek bir "son seçilen depo" tutulsaydı, sabah Kehl'e giden depocunun telefonu ile
  ofisteki tabletin seçimi birbirini ezerdi.

  ── NEDEN MODÜL DÜZEYİNDE DURUM, NEDEN BAĞLAM DEĞİL ─────────────────────────
  Seçimi iki taraf birden okuyor: EKRANLAR (yeniden çizilmek için) ve TEL (`lib/api/warehouse` ·
  `lib/api/sale`, adrese `?warehouseId=` yazmak için). Tel katmanı bir React bağlamını okuyamaz ve
  okumamalı da — `warehouse-status.ts`in kendi künyesindeki katman kuralının aynısı. Ortak nokta
  bu yüzden modül düzeyinde bir değer; ekranlar ona `useSyncExternalStore` ile bağlanır.
*/

/** Seçilen deponun kimliği; `null` = seçim yok (tek depolu personelin normal hâli). */
let chosenId: string | null = null;
const listeners = new Set<() => void>();

function publish(next: string | null): void {
  if (next === chosenId) return;
  chosenId = next;
  for (const listener of listeners) listener();
}

/**
 * **Kapıda bir kez: cihazdaki seçimi yükler ve KAPSAMA karşı doğrular.**
 *
 * Doğrulama burada, çünkü kapsam ancak burada biliniyor: yönetici personeli başka bir tesise
 * aldığında cihazda kalan eski kimlik, her isteği `403 warehouse_out_of_scope`a çevirirdi —
 * ekranda "bu kayıt başka deponun" diyen, sebebi hiçbir yerde yazmayan bir duvar. Kapsamdan düşen
 * seçim SESSİZCE değil, GÖRÜNÜR biçimde temizlenir: seçim yok demek, ekranın yeniden sormasıdır.
 *
 * Cihaz deposu düşerse (izin, bozuk kayıt, taze kurulum) seçim YOK sayılır — hata yutulmuyor,
 * çağıranın davranışını değiştiren bir sonuca çevriliyor: ekran sorar (printer-choice'un aynı
 * hükmü).
 */
export async function loadWarehouseChoice(scopeIds: readonly string[]): Promise<void> {
  let stored: string | null = null;
  try {
    stored = await deviceStore.getItem(DEVICE_STORE_KEYS.warehouseChoice);
  } catch {
    stored = null;
  }

  if (stored !== null && !scopeIds.includes(stored)) {
    publish(null);
    try {
      await deviceStore.removeItem(DEVICE_STORE_KEYS.warehouseChoice);
    } catch {
      // Silinemedi: bellekteki seçim yine de temiz ve kapsam denetimi her açılışta yeniden koşar.
    }
    return;
  }

  publish(stored);
}

/**
 * **Personelin AÇIK seçimi.** SENKRON döner ve bu bilinçli: çağıran hemen ardından bölümün
 * okumasını tazeliyor (`resetWarehouseStatus` + `reload`) ve o istek seçimi GÖRMEK zorunda. Söz
 * beklenseydi, cihaz deposunun yavaş olduğu bir anda ilk istek hâlâ deposuz gider ve ekran bir kez
 * daha "hangi depo" derdi.
 *
 * Kalıcılık arkadan yazılır; düşerse bu oturum yine çalışır, yalnız seçim uygulama kapanınca
 * yeniden sorulur. Sessiz bir yanlış davranış değil, kalıcılığın kaybı — seçimi hiç uygulamamak
 * ise personeli yine duvara çarpardı.
 */
export function chooseWarehouse(warehouseId: string): void {
  publish(warehouseId);
  void deviceStore.setItem(DEVICE_STORE_KEYS.warehouseChoice, warehouseId).catch(() => undefined);
}

/**
 * **Seçimi bırakır** — "depo değiştir" (kimlik menüsü). Ekran hemen yeniden sorar, çünkü seçim
 * olmayınca çalışılan tesis de belirsizleşir (`useOperationsWorkplace` → `null`).
 *
 * BAŞKA BİR DEPOYA doğrudan geçirmiyor ve bu bilinçli: menüde tesis listesi çizmek, aynı seçiciyi
 * iki yerde birden yaşatmak olurdu (CLAUDE §1). Menü kararı SORAR, cevabı kapsam ekranı alır.
 */
export function clearWarehouseChoice(): void {
  publish(null);
  void deviceStore.removeItem(DEVICE_STORE_KEYS.warehouseChoice).catch(() => undefined);
}

/** Tel katmanının senkron okuması — React dışından çağrılır. */
export function chosenWarehouseId(): string | null {
  return chosenId;
}

/**
 * **İsteğin adresine seçimi ekler.** Seçim yoksa adres AYNEN döner — tek depolu personelde
 * hiçbir şey değişmez ve kimlik eskisi gibi jetondan çözülür (`warehouseGuard`ın birinci hâli).
 *
 * Adreste zaten sorgu varsa `&` ile eklenir: `?` ile eklemek `q=` gibi mevcut parametreleri
 * sessizce yutardı (`/warehouse/variants?q=…` ve `/sale/catalog?locale=tr` böyle çağrılıyor).
 */
export function withWarehouseChoice(path: string): string {
  if (chosenId === null) return path;
  return `${path}${path.includes('?') ? '&' : '?'}warehouseId=${encodeURIComponent(chosenId)}`;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function snapshot(): string | null {
  return chosenId;
}

/** Ekranların okuması — seçim değişince yeniden çizilirler. */
export function useChosenWarehouse(): string | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/**
 * Testlerin başlangıç noktası. Modül düzeyinde durum dosyalar arası sızar: bir testin seçtiği
 * depo, sonraki testin isteğine sessizce bir parametre eklerdi.
 */
export function resetWarehouseChoice(): void {
  chosenId = null;
  for (const listener of listeners) listener();
}
