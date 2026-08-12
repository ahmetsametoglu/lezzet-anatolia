import { DEVICE_STORE_KEYS, deviceStore } from '../storage/device-store';

/*
  KABUL EDİLMİŞ DAVET KODU — web'in davet çerezinin (`apps/web/lib/identity/invite-cookie.ts`)
  native karşılığı. ORTAKLIK ZORLANMAZ (02-mimari §3.6): saklama kabı platformun kendi kabıdır,
  paylaşılan olan KURALDIR — kod kabul anında saklanır, ilk girişte kayda bağlanır, orada biter.

  ── NEDEN SAKLANIYOR ────────────────────────────────────────────────────────
  Davet bağlantısı ile hesabın açılması AYNI AN DEĞİL. Davetli bağlantıyı açar, kataloğu gezer,
  belki ertesi gün sipariş verirken hesap açar. Kodu o ana taşıyacak bir yer olmasaydı bağ hiç
  kurulmazdı ve getiren, gerçekten getirdiği müşteri için puan almazdı — 17.7'nin kopuk kalmasının
  sebebi tam olarak buydu.

  ── YAZIM AÇILIŞTA DEĞİL, DOKUNUŞTA ─────────────────────────────────────────
  Bağlantıyı açmak bir NİYET değildir (web çerezinin aynı kararı, aynı gerekçe): mesajı yanlışlıkla
  açan da, merak eden de onu açar. Kod ancak davetli karşılama ekranında "kataloğa bak" ya da
  "hesap aç" dediğinde yazılır; o dokunuş kabulün kendisidir.

  ── SİLİNMESİ AKIŞIN PARÇASI ────────────────────────────────────────────────
  Kod ilk BAŞARILI girişte tüketilir ve silinir (`lib/auth/otp.ts`). Bırakılsaydı cihazdan
  kaydolan İKİNCİ kişi de aynı kodla bağlanmaya çalışırdı — motor `already_referred` ile reddeder,
  yani zarar vermez ama sessizce her girişe bir yazma denemesi eklerdi.

  NEDEN SECURESTORE: projede kurulu tek yerel anahtar-değer deposu bu (bekleyen kaydırmalar
  deposunun aynı ölçümü — package.json'da AsyncStorage yok). Değer sır değil, tek satırlık bir kod;
  ikinci bir depo paketi açmak yeni bir bağımlılık demekti.
*/

/** Depo anahtarı — ham dizge burada YAZILMAZ, `lezzet.*` ailesinin sahibinden gelir. */
const INVITE_KEY = DEVICE_STORE_KEYS.invite;

/**
 * Kabul edilen kodu cihaza yazar. Hata YUTULMAZ, çağırana taşınmaz da: yazılamayan kodun
 * müşteriye söylenecek bir karşılığı yok (mobilde log altyapısı da yok — 01-teknoloji §9) ve
 * bedeli ölçülü: davet bağı kurulmaz, akışın kendisi etkilenmez. Karşılama ekranı yine açılır,
 * davetli yine kataloğa girer.
 */
export async function rememberInvite(code: string): Promise<void> {
  const trimmed = code.trim();
  if (trimmed.length === 0) return;
  try {
    await deviceStore.setItem(INVITE_KEY, trimmed);
  } catch {
    /* Yukarıdaki künye: sessizliğin gerekçesi yazılı, boş `catch` değil. */
  }
}

/** Bekleyen kod; yoksa `null`. Okuma düşerse "kayıt yok" ile aynı kapıya çıkar. */
export async function readInvite(): Promise<string | null> {
  try {
    const raw = await deviceStore.getItem(INVITE_KEY);
    return raw && raw.trim().length > 0 ? raw.trim() : null;
  } catch {
    /* Aynı hüküm: ölçemediğimiz kod "yok" sayılır — bağ kurulmaz, giriş etkilenmez. */
    return null;
  }
}

/** Kod tüketildi (giriş tamamlandı) — bir daha denenmesin. */
export async function clearInvite(): Promise<void> {
  try {
    await deviceStore.removeItem(INVITE_KEY);
  } catch {
    /* Silinemeyen kod bir sonraki girişte yeniden denenir; motor `already_referred` ile reddeder. */
  }
}
