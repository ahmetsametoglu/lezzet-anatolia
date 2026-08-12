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

/*
  ── İKİ DAVET, TEK UYGULAMA (21.45) ─────────────────────────────────────────
  Komşu daveti (17.10) de aynı yolculuğu yaşıyor: bağlantı kimliği olmayan birinde açılıyor, kabul
  cihazda bekliyor, giriş olunca kişiye yazılıyor. Web de ikisini aynı dosyada tutuyor
  (`invite-cookie.ts`) ve gerekçesi aynı: ayrı ayrı yazılsalardı biri bir gün ötekinden ayrışırdı
  — sessizce, çünkü yanlış saklanan bir davet hata vermez, yalnız kaybolur.

  İKİSİNİN ÖMRÜ BURADA AYRILMIYOR (web'de ayrılıyor: 30 gün ↔ 7 gün). Sebep kabın kendisi:
  SecureStore'da süre yok, kayıt uygulama silinene dek durur. Ama bu bir kayıp değil — ölmüş bir
  komşu davetini sunucu zaten reddediyor (`run_closed`) ve reddedilen kabul cihazdan siliniyor.
  Süreyi istemciye taklit ettirmek, aynı kuralın ikinci ve yanlışlanabilir bir kopyası olurdu.
*/

/** Depo anahtarları — ham dizge burada YAZILMAZ, `lezzet.*` ailesinin sahibinden gelir. */
const INVITE_KEY = DEVICE_STORE_KEYS.invite;
const NEIGHBOR_KEY = DEVICE_STORE_KEYS.neighborInvite;

/**
 * Kabul edileni cihaza yazar. Hata YUTULMAZ, çağırana taşınmaz da: yazılamayan bir davetin
 * müşteriye söylenecek karşılığı yok (mobilde log altyapısı da yok — 01-teknoloji §9) ve bedeli
 * ölçülü: bağ kurulmaz, akışın kendisi etkilenmez. Karşılama ekranı yine açılır, davetli yine
 * kataloğa girer.
 */
async function remember(key: string, value: string): Promise<void> {
  const trimmed = value.trim();
  if (trimmed.length === 0) return;
  try {
    await deviceStore.setItem(key, trimmed);
  } catch {
    /* Yukarıdaki künye: sessizliğin gerekçesi yazılı, boş `catch` değil. */
  }
}

/** Bekleyen değer; yoksa `null`. Okuma düşerse "kayıt yok" ile aynı kapıya çıkar. */
async function read(key: string): Promise<string | null> {
  try {
    const raw = await deviceStore.getItem(key);
    return raw && raw.trim().length > 0 ? raw.trim() : null;
  } catch {
    /* Aynı hüküm: ölçemediğimiz davet "yok" sayılır — bağ kurulmaz, giriş etkilenmez. */
    return null;
  }
}

async function forget(key: string): Promise<void> {
  try {
    await deviceStore.removeItem(key);
  } catch {
    /* Silinemeyen kayıt bir sonraki girişte yeniden denenir; sunucu tekrarı sessizce reddeder. */
  }
}

/** Getiren davetinin kodunu saklar. */
export function rememberInvite(code: string): Promise<void> {
  return remember(INVITE_KEY, code);
}

/** Bekleyen getiren kodu. */
export function readInvite(): Promise<string | null> {
  return read(INVITE_KEY);
}

/** Kod tüketildi (giriş tamamlandı) — bir daha denenmesin. */
export function clearInvite(): Promise<void> {
  return forget(INVITE_KEY);
}

/** Komşu davetinin belirtecini saklar (21.45). */
export function rememberNeighborInvite(token: string): Promise<void> {
  return remember(NEIGHBOR_KEY, token);
}

/** Bekleyen komşu belirteci. */
export function readNeighborInvite(): Promise<string | null> {
  return read(NEIGHBOR_KEY);
}

/**
 * Komşu belirteci tüketildi. **Reddedilse de silinir** (sefer geçti, kontenjan doldu, kendi
 * daveti): o davetin yeniden denenecek bir hâli yok ve cihazda durması yalnız gürültü olurdu —
 * web çerezinin aynı kararı.
 */
export function clearNeighborInvite(): Promise<void> {
  return forget(NEIGHBOR_KEY);
}
