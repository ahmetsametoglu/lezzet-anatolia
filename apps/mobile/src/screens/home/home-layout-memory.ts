import { z } from 'zod';

import { DEVICE_STORE_KEYS, deviceStore } from '@/lib/storage/device-store';

/*
  VİTRİN YERLEŞİM İZİ — son BAŞARILI vitrin yüklemesinde hangi bölümlerin kaç elemanla
  görüldüğü. Tek okuyanı iskelet, tek yazanı vitrin ekranıdır.

  NİYE VAR (kullanıcı kararı 10.08): iskeletin tek işi gelecek yerleşimin ölçüsünü tutmaktır ama
  vitrinin bölümleri KOŞULLU — sipariş bandı yalnız girişli ve siparişi olan müşteride, fırsat
  şeridi yerin depo cevabına bağlı, paketler/tarifler uçtan boş dönebilir. İskelet hepsini var
  sayarsa (eski hâli) veri gelince bölümler ortadan kaybolur ve ekran ZIPLAR; hiçbirini saymazsa
  bu kez gelenler ekranı aşağı iter. İkisi de aynı arızanın iki yüzü.

  Cihaz zaten bu müşterinin vitrinini bir kez gördü: en iyi tahmin GEÇEN SEFERKİDİR. İz o yüzden
  var/yok değil SAYI tutar — dikey bölümlerde (koleksiyon bantları, paketler) yüksekliği doğrudan
  eleman sayısı belirliyor.

  İZ BİR TAHMİNDİR, SÖZLEŞME DEĞİL: yanlış çıkarsa bedeli tek karelik bir kayma; o yüzden okuma
  arızası, bozuk kayıt ve kayıt yokluğu aynı kapıya çıkar → `DEFAULT_HOME_LAYOUT`. Depo seçimi
  onboarding izinin aynısı (`lib/storage/device-store` — projedeki tek anahtar-değer deposu, tek
  anahtar tek JSON); şema burada durur çünkü bu bir alan sözleşmesi değil, CİHAZ-YEREL saklama
  şeklidir (onboarding deposunun aynı hükmü).
*/

const STORAGE_KEY = DEVICE_STORE_KEYS.homeLayout;

/*
  Eleman sayısının üst sınırı uç sözleşmesinin BUGÜNKÜ tavanı değildir (bant 6 · fırsat 2 ·
  seçki 4 · tarif 3 · paket 2): tavanı buraya yazsaydık uç bir gün bir bölümü genişlettiğinde
  yazdığımız iz kendi doğrulamamıza takılır ve sessizce varsayılana düşerdi. Buradaki sınır
  yalnız BOZUK kayda karşıdır — cihazdan dönen değer bizim yazdığımız değer olmayabilir ve
  "1000 bant" gibi bir sayı iskeleti ekran boyu griye çevirirdi.
*/
const SectionCount = z.number().int().min(0).max(24);

const HomeLayoutSchema = z.object({
  /** Süren sipariş YA DA "geçen siparişi tekrarla" bandı vardı — ikisi aynı ölçüde ve asla birlikte çizilmiyor. */
  orderBand: z.boolean(),
  /**
   * Günün fırsatı bandı vardı. BUGÜN HEP `false`: bandın ucu yok, sayfa da çizmiyor (vitrin
   * künyesi). Alan burada duruyor ki uç geldiği gün iskelet kendiliğinden takip etsin — kaldırıp
   * geri eklemek, aynı kararı iki kez vermek olurdu.
   */
  flash: z.boolean(),
  offers: SectionCount,
  bands: SectionCount,
  featured: SectionCount,
  recipes: SectionCount,
  packages: SectionCount,
});

export type HomeLayout = z.infer<typeof HomeLayoutSchema>;

/**
 * İZ YOKKEN (ilk kurulum) çizilecek yerleşim — kullanıcının "her zaman görünür" listesi:
 * koleksiyonlar · fırsatlar · vitrin · sofradan fikirler · paketler. Sayılar uç sözleşmesinin
 * tavanlarıdır (bant 6 = 4 kategori + 2 koleksiyon · fırsat 2 · seçki 4 · tarif 3 · paket 2).
 *
 * Sipariş bandı ve günün fırsatı burada YOK: ilki yalnız girişli müşteride, ikincisi nadir bir
 * kampanya. İlk açılışta müşterinin siparişi de olamaz.
 */
export const DEFAULT_HOME_LAYOUT: HomeLayout = {
  orderBand: false,
  flash: false,
  offers: 2,
  bands: 6,
  featured: 4,
  recipes: 3,
  packages: 2,
};

/** `undefined` = depo henüz okunmadı; `null` = kayıt yok. İkisinde de varsayılan çizilir. */
export type HomeLayoutSnapshot = HomeLayout | null | undefined;

let snapshot: HomeLayoutSnapshot = undefined;
let readStarted = false;
const listeners = new Set<() => void>();

function publish(next: HomeLayout | null): void {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

/** İki iz aynı mı — aynıysa disk hiç yazılmaz (vitrin her yüklemede yazmayı dener). */
function sameLayout(a: HomeLayout, b: HomeLayout): boolean {
  return (
    a.orderBand === b.orderBand &&
    a.flash === b.flash &&
    a.offers === b.offers &&
    a.bands === b.bands &&
    a.featured === b.featured &&
    a.recipes === b.recipes &&
    a.packages === b.packages
  );
}

/** Depodaki izi okur; kayıt yok · bozuk · okunamadı üçü de `null` (üçünde de doğru davranış aynı). */
export async function readHomeLayout(): Promise<HomeLayout | null> {
  try {
    const raw = await deviceStore.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed = HomeLayoutSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    // Sessizliğin nedeni: mobilde log altyapısı yok (01-teknoloji §9) ve bu hatanın kullanıcıya
    // söylenecek karşılığı yok — iskelet varsayılan yerleşimi çizer, en kötüsü bir kez kayar.
    return null;
  }
}

/**
 * Vitrin BAŞARIYLA yüklendiğinde çağrılır — önce bellek, sonra disk (onboarding deposunun aynı
 * sırası: aynı oturumda ikinci bir iskelet çizilirse taze izi görsün).
 */
export async function saveHomeLayout(layout: HomeLayout): Promise<void> {
  // Aynı iz yeniden yazılmaz: vitrin her yüklemede çağırıyor ve değişmeyen bir kayıt için
  // Keychain'e gitmek bedava değil.
  if (snapshot !== undefined && snapshot !== null && sameLayout(snapshot, layout)) return;
  publish(layout);
  try {
    await deviceStore.setItem(STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Yukarıdaki okumayla aynı hüküm. Bellek yansıması bu oturumu taşıyor; yazma düştüyse bedeli
    // sonraki açılışta bir önceki izin (ya da varsayılanın) çizilmesi.
  }
}

/** İlk abonelikte depo bir kez okunur (onboarding deposunun deseni). */
export function subscribeHomeLayout(listener: () => void): () => void {
  if (!readStarted) {
    readStarted = true;
    void readHomeLayout().then((stored) => {
      // Okuma sürerken vitrin bir iz yazdıysa (yarış) taze olan kazanır, eski disk değeri ezmez.
      if (snapshot === undefined) publish(stored);
    });
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getHomeLayoutSnapshot(): HomeLayoutSnapshot {
  return snapshot;
}
