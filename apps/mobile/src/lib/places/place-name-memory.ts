import { useSyncExternalStore } from 'react';
import { z } from 'zod';

import { DEVICE_STORE_KEYS, deviceStore } from '@/lib/storage/device-store';

/*
  POSTA KODUNUN ÇÖZÜLMÜŞ YER ADI — cihaz-yerel bellek (MB-80, 23.08).

  ── HANGİ ARIZAYI KAPATIYOR (ölçüldü, teori değil) ──────────────────────────
  Vitrin başlığı `postalLabel`i şöyle kuruyordu (`home-screen.tsx`):
      savedPlaceName === null ? postalCode : `${postalCode} ${AD}`
  ve `savedPlaceName` ÜÇ ayrı durumda `null`: kod eksik · cevap HENÜZ gelmedi · istek DÜŞTÜ. Yani
  vitrin HER açılışta, `/places` cevabı gelene kadar başlıkta yalnız *"67000"* yazıyordu; kullanıcı
  11.08'de tam o kareyi yakaladı ve kayıt "üretilemedi, teori" diye açık kalmıştı. Nadir bir arıza
  değilmiş — her seferinde olan, genelde çok kısa süren bir geçiş.

  İkinci ve daha kötü hâl: **istek düşerse başlık kalıcı olarak çıplak kodda kalıyor.** Hook bu iki
  hâli ayırt edebilsin diye `pending` bayrağını zaten üretiyor (`use-place-resolution` künyesi),
  ama vitrin ince sarmalayıcıyı kullanıp o bayrağı yere düşürüyor.

  ── NEDEN İSKELET DEĞİL, BELLEK ─────────────────────────────────────────────
  "Cevap gelene kadar iskelet çiz" ilk akla gelen çare ama daha kötüsü: ilk açılışta yine bir
  bekleme çizilir ve DÜŞEN istekte iskelet hiç sönmez. Oysa cevabın kendisi zaten biliniyor —
  **bir posta kodunun şehri değişmez.** Cihaz bunu geçen sefer öğrendi; en doğru tahmin odur.
  Vitrin yerleşim izinin (`home-layout-memory`) aynı gerekçesi.

  ── YALNIZ AD SAKLANIR, ÇÖZÜMÜN TAMAMI DEĞİL ────────────────────────────────
  `PlaceResolution` içinde `inRoute` ve hizmet kapsamı gibi DEĞİŞEBİLEN alanlar da var; onları
  saklayıp taze veri gibi okumak, stok işaretini ve bölge uyarısını bayat bilgiyle çizmek olurdu
  (CLAUDE §0 — belirtiyi susturan çözüm). Saklanan tek şey, gerçekten değişmeyen şey: kodun ADI.
  Stok işareti ve uyarı bandı canlı çözümü okumaya devam ediyor.

  ── TEK KAYIT, ANAHTARI KODUN KENDİSİ ───────────────────────────────────────
  Harita değil tek satır tutuluyor: müşterinin bir kayıtlı kodu var. Kod değişirse kayıt artık
  eşleşmez ve kullanılmaz — bayat bir şehir adının yeni kodun yanında görünmesi, düzeltmeye
  çalıştığımız yanlışın daha betersidir. Belirsiz kod (`ambiguous_zone`) hiç yazılmaz, çünkü orada
  çözülmüş bir ad yoktur.
*/

const STORAGE_KEY = DEVICE_STORE_KEYS.placeName;

const PlaceNameSchema = z.object({
  /** Adın ait olduğu posta kodu — eşleşmezse kayıt yok sayılır. */
  code: z.string().min(1),
  name: z.string().min(1),
});
type PlaceNameMemory = z.infer<typeof PlaceNameSchema>;

/** `undefined` = depo henüz okunmadı; `null` = kayıt yok. İkisinde de çıplak kod yazılır. */
type Snapshot = PlaceNameMemory | null | undefined;

let snapshot: Snapshot = undefined;
let readStarted = false;
const listeners = new Set<() => void>();

function publish(next: PlaceNameMemory | null): void {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

async function readMemory(): Promise<PlaceNameMemory | null> {
  try {
    const raw = await deviceStore.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed = PlaceNameSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    // Sessizliğin nedeni: mobilde log altyapısı yok (01-teknoloji §9) ve bu hatanın kullanıcıya
    // söylenecek karşılığı yok — başlık bugünkü davranışına, çıplak koda düşer.
    return null;
  }
}

/**
 * Ad ÇÖZÜLDÜĞÜNDE çağrılır — önce bellek, sonra disk (yerleşim izinin aynı sırası: aynı oturumda
 * ikinci bir okuyucu taze kaydı görsün). Aynı kayıt yeniden yazılmaz; vitrin her açılışta çağırır.
 */
export async function rememberPlaceName(code: string, name: string): Promise<void> {
  if (code.length === 0 || name.length === 0) return;
  if (snapshot?.code === code && snapshot.name === name) return;
  publish({ code, name });
  try {
    await deviceStore.setItem(STORAGE_KEY, JSON.stringify({ code, name }));
  } catch {
    // Yazamadık — bellekteki kayıt bu oturum için yeterli, sonraki açılış yine ağı bekler.
    // Kullanıcıya söylenecek bir şey yok; kayıp olan tek şey bir karelik rahatlık.
  }
}

/**
 * Bu kod için hatırlanan ad — yoksa `null`.
 *
 * Depo okuması ilk abonelikte başlar (yerleşim izinin deseni): ekran render'ı diski beklemez,
 * cevap gelince abonelik uyandırır. Diskten okuma ağdan kat kat hızlıdır, o yüzden çıplak kod
 * karesi ilk açılış dışında görünmez; ilk açılışta zaten hatırlanacak bir şey yoktur.
 */
export function useRememberedPlaceName(code: string | null): string | null {
  const memory = useSyncExternalStore(subscribe, getSnapshot);
  if (code === null || !memory) return null;
  return memory.code === code ? memory.name : null;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (!readStarted) {
    readStarted = true;
    void readMemory().then(publish);
  }
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Snapshot {
  return snapshot;
}

/** Testler için — modül düzeyi bellek dosyalar arasında sızmasın. */
export function resetPlaceNameMemory(): void {
  snapshot = undefined;
  readStarted = false;
  listeners.clear();
}
