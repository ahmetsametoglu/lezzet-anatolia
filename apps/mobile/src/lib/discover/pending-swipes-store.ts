import { z } from 'zod';

import { DEVICE_STORE_KEYS, deviceStore } from '../storage/device-store';

/*
  BEKLEYEN KAYDIRMALAR DEPOSU — girişsizken yapılan oyların cihazda kalan izi. Web'in tarayıcı
  deposunun (`apps/web/lib/feedback/discover-store.ts`) native karşılığı; ORTAKLIK ZORLANMAZ
  (02-mimari §3.6): saklama kabı platformun kendi kabıdır, paylaşılan olan SÖZLEŞMEDİR (tavan ve
  kimliklerin anlamı `DiscoverClaimBodySchema`dan gelir).

  NİYE VAR: girişsiz kaydırma sunucuda kimliksiz bir satır olarak durur ve puanı YOKTUR (`/vote`
  cevabı `pointsAwarded: null` — sıfır değil, sahibi yok). Müşteri giriş yaptığında bu satırlar
  talep kapısına (`/me/discover/claim`) götürülüp hesabına bağlanır; kimlikleri saklamazsak o
  emek sessizce kaybolurdu.

  NEDEN SECURESTORE: projede kurulu tek yerel anahtar-değer deposu bu (onboarding deposunun aynı
  ölçümü — package.json'da AsyncStorage yok). Veri sır değil; ikinci bir depo paketi açmak yeni
  bir bağımlılık ve ikinci bir saklama kapısı demekti.

  BİLİNEN SINIR — BOYUT: SecureStore büyük değerlerde platformun kendi sınırına takılabilir
  (tarihsel iOS eşiği ~2048 bayt; oturum deposunda aynı sınır bilinçli kabul edildi). Tavan dolu
  bir liste (200 kimlik) bu eşiğin üstündedir. Bugün kabul ediliyor çünkü (a) sunucunun destesi
  tek turda 20 kart (`DECK_SIZE`), yani tavana ancak on tur biriktiren bir ziyaretçi ulaşır,
  (b) yazma düşerse bedeli ölçülü: tur ÇALIŞMAYA DEVAM EDER, yalnız o oyların puanı giriş
  dönüşünde talep edilemez. Sorun üretirse çare kabı değiştirmektir ve tek dosya olduğu için tek
  yerden değişir.

  ŞEMA BURADA, `packages/types`TA DEĞİL: bu bir alan sözleşmesi değil, CİHAZ-YEREL saklama
  şeklidir (onboarding deposunun kuralı). Zod'la doğrulanır çünkü depodan dönen değer bizim
  yazdığımız değer olmayabilir (eski sürüm, bozuk kayıt); bozuk kayıt "kayıt yok" ile aynı kapıya
  çıkar, uygulama kararmaz.
*/

/** Depo anahtarı — ham dizge burada YAZILMAZ, `lezzet.*` ailesinin sahibinden gelir. */
const PENDING_SWIPES_KEY = DEVICE_STORE_KEYS.discoverPending;

/**
 * Cihazda tutulan en fazla kaydırma. Sözleşmenin talep tavanıyla AYNI sayı
 * (`DiscoverClaimBodySchema.swipeIds` `.max(200)`) — daha fazlasını saklamak, tek istekte
 * gönderilemeyecek bir kuyruk biriktirmek olurdu.
 */
const MAX_PENDING = 200;

/** Depo şeması — kimlikler sunucudan gelen opak dizelerdir, istemci içlerini yorumlamaz. */
const PendingSwipesSchema = z.array(z.string().min(1));

/**
 * Bellek yansıması: okuma-değiştirme-yazma yarışının panzehiri. Art arda iki kaydırma diske
 * paralel yazsaydı ikincisi birincinin kimliğini silerdi — sıra bellekte tutulur, disk onun
 * kopyasıdır. `null` = depo henüz okunmadı.
 */
let cache: string[] | null = null;

/** Diskteki kayıt; okunamayan/bozuk kayıt "kayıt yok" ile aynı kapıya çıkar. */
async function readFromDisk(): Promise<string[]> {
  try {
    const raw = await deviceStore.getItem(PENDING_SWIPES_KEY);
    if (raw === null) return [];
    const parsed = PendingSwipesSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return [];
    // Tavan geçmişte daha yüksekken yazılmış bir kayıt gelirse EN YENİLER tutulur (kuyruk sonu).
    return parsed.data.slice(-MAX_PENDING);
  } catch {
    // Sessizliğin nedeni: mobilde log altyapısı yok (onboarding deposuyla aynı hüküm, 01-teknoloji
    // §9) ve bu hatanın kullanıcıya söylenecek karşılığı yok — en kötüsü bir turun puanı talep
    // edilemez, akış kesilmez.
    return [];
  }
}

async function writeToDisk(ids: string[]): Promise<void> {
  try {
    if (ids.length === 0) {
      await deviceStore.removeItem(PENDING_SWIPES_KEY);
      return;
    }
    await deviceStore.setItem(PENDING_SWIPES_KEY, JSON.stringify(ids));
  } catch {
    // Sessizliğin nedeni yukarıdaki okumayla aynı. Bellek yansıması bu oturumu taşır; yazma
    // düştüyse bedeli, uygulamanın kapanmasıyla o kimliklerin kaybı — turun kendisi etkilenmez.
  }
}

/** Depodaki kimlikler (en eskiden en yeniye). Boş dizi = bağlanacak kaydırma yok. */
export async function readPendingSwipes(): Promise<string[]> {
  if (cache === null) cache = await readFromDisk();
  return [...cache];
}

/**
 * Girişsiz bir kaydırmanın kimliğini kuyruğa ekler. Tavan aşılırsa EN ESKİ kayıt düşer: yeni oy
 * müşterinin son niyetidir, onu eskiye feda etmek yanlış olurdu.
 */
export async function appendPendingSwipe(id: string): Promise<void> {
  const current = cache ?? (await readFromDisk());
  cache = [...current, id].slice(-MAX_PENDING);
  await writeToDisk(cache);
}

/** Talep kapısından geçen kuyruk temizlenir — aynı kimlikler ikinci kez taşınmasın. */
export async function clearPendingSwipes(): Promise<void> {
  cache = [];
  await writeToDisk(cache);
}
