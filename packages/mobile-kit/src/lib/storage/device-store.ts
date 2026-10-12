import * as SecureStore from 'expo-secure-store';
import { Platform, Settings } from 'react-native';

/*
  Cihaz deposu: `lezzet.*` anahtar ailesinin tek sahibi ve SecureStore'a açılan tek kapı. iOS Keychain kaydı uygulama silinince
  silinmediği için ilk açılışta (NSUserDefaults'taki işaret yoksa) önceki kurulumun anahtarları her okumadan önce silinir.
*/

/**
 * Cihazda saklanan HER `lezzet.*` anahtarı burada doğar; başka dosyada ham anahtar dizgesi
 * yazılmaz (CLAUDE §1 duplikasyon yasağı). Yeni bir cihaz-yerel kayıt eklenecekse anahtarı
 * buraya yazılır — böylece yeniden kurulum temizliği onu kendiliğinden kapsar.
 */
export const DEVICE_STORE_KEYS = {
  /** supabase-js oturumu (access + refresh + süre alanları) — tek JSON. */
  authSession: 'lezzet.auth.session',
  /** Onboarding izi: gösterildi mi, hangi dil, hangi posta kodu. */
  onboarding: 'lezzet.onboarding',
  /** Yazı boyutu tercihi. */
  fontScale: 'lezzet.fontScale',
  /** Bu cihazın iş başına yazıcısı (`{ box, shipping }`); envanter sunucuda, seçim cihazda, çünkü aynı depodaki iki telefon ayrı yazıcıya basabilir. */
  printerChoice: 'lezzet.printer.choice',
  /** Bu cihazın çalıştığı depo (çok depolu personelin seçimi); kapsam sunucuda, seçim cihazda, çünkü aynı kapsamdaki iki kişi farklı tesiste olabilir. */
  warehouseChoice: 'lezzet.warehouse.choice',
  /**
   * Uygulamanın dili — kullanıcının AÇIK seçimi (kayıt yoksa seçim de yok, cihaz dili geçerli).
   * Tek okuyanı/yazanı `lib/i18n/app-locale.ts` ve o da bu kapıdan geçer.
   */
  appLocale: 'lezzet.locale',
  /** Girişsiz yapılan kaydırmaların kimlikleri (girişte hesaba bağlanır). */
  discoverPending: 'lezzet.discover.pending',
  /** Vitrinin son başarılı yüklemesinde hangi bölümler kaç elemanla vardı — iskelet bunu taklit eder. */
  homeLayout: 'lezzet.home.layout',
  /** Kabul edilmiş davet kodu; ilk girişte kayda bağlanır ve silinir (`lib/invite/invite-store`). */
  invite: 'lezzet.invite',
  /** Kabul edilmiş KOMŞU daveti belirteci; aynı kapıdan aynı anda devredilir. */
  neighborInvite: 'lezzet.invite.neighbor',
  /** Posta kodunun ÇÖZÜLMÜŞ yer adı — vitrin başlığı cevabı beklerken çıplak kod yazmasın diye. */
  placeName: 'lezzet.place.name',
  /**
   * Sunucuya kayıtlı push jetonu; çıkışta silinebilsin diye saklanır, yoksa önceki hesabın bildirimi sonraki oturum sahibine düşerdi.
   * Tek okuyanı ve yazanı `lib/push`.
   */
  pushToken: 'lezzet.push.token',
  /** Cevabı gelmemiş yerinde satış (kimlik ve sepet); operasyon uygulaması aynı satışı aynı kimlikle yeniden göndermek için okur. */
  pendingSale: 'lezzet.sale.pending',
} as const;

/**
 * Yeniden kurulumda silinecek anahtarların TAM listesi — ailenin kendisi artı supabase-js'in
 * `storageKey`in YANINA yazdığı PKCE doğrulayıcısı (`${storageKey}-code-verifier`, auth-js
 * `GoTrueClient`). O da önceki kurulumdan kalmadır; bırakılırsa yarım bir OAuth akışının izi
 * yeni kuruluma sızardı.
 */
const WIPE_KEYS: readonly string[] = [
  ...Object.values(DEVICE_STORE_KEYS),
  `${DEVICE_STORE_KEYS.authSession}-code-verifier`,
];

/** İlk açılış işareti — NSUserDefaults anahtarı. SecureStore'a YAZILMAZ; orası silinmiyor. */
const INSTALL_MARKER_KEY = 'lezzet.installMarker';

/**
 * İşaretin değeri. Sürümlü: ileride "bu kurulumun deposunu bir kez daha boşalt" gerekirse değer
 * yükseltilir ve temizlik tek seferliğine yeniden koşar (bayrağı silmeye gerek kalmaz).
 */
const INSTALL_MARKER_VALUE = 'v1';

/** `unmeasured` = işaret OKUNAMADI; "yok" ile aynı şey DEĞİLDİR (CLAUDE §1). */
type MarkerState = 'present' | 'absent' | 'unmeasured';

function readInstallMarker(): MarkerState {
  try {
    return Settings.get(INSTALL_MARKER_KEY) === INSTALL_MARKER_VALUE ? 'present' : 'absent';
  } catch {
    /* Okunamayan işaret "yok" sayılsaydı kapı her açılışta kullanıcıyı çıkışa atardı; `unmeasured` çağıranı erken çıkarır. */
    return 'unmeasured';
  }
}

/** İşareti yazar; `false` = yazılamadı (o zaman temizlik sonraki açılışta yeniden denenir). */
function writeInstallMarker(): boolean {
  try {
    Settings.set({ [INSTALL_MARKER_KEY]: INSTALL_MARKER_VALUE });
    return true;
  } catch {
    // Yukarıdaki okumayla aynı hüküm: hata yutulmuyor, `false` olarak çağırana taşınıyor.
    return false;
  }
}

/** Tüm aileyi siler; `false` = en az bir silme düştü (işaret yazılmaz, sonraki açılış tekrarlar). */
async function wipeDeviceStore(): Promise<boolean> {
  const outcomes = await Promise.all(
    WIPE_KEYS.map(async (key) => {
      try {
        await SecureStore.deleteItemAsync(key);
        return true;
      } catch {
        /* Tek anahtarın silinmemesi ötekileri durdurmaz — yarım temizlik hiç temizlikten iyidir
           ve eksik kalan anahtar `false` üzerinden bir sonraki açılışa devredilir. */
        return false;
      }
    }),
  );
  return outcomes.every(Boolean);
}

async function runFreshInstallGuard(): Promise<void> {
  // Yalnız iOS: Keychain kalıcıdır; Android'de kayıt uygulamayla gider ve `Settings` yoktur.
  if (Platform.OS !== 'ios') return;

  const marker = readInstallMarker();
  // `present` → normal akış. `unmeasured` → ölçemedik, dokunmuyoruz.
  if (marker !== 'absent') return;

  const wiped = await wipeDeviceStore();
  if (!wiped) return;

  writeInstallMarker();
}

/** Tek uçuşlu söz: kaç yerden çağrılırsa çağrılsın temizlik bir kez koşar. */
let guard: Promise<void> | null = null;

/**
 * Yeniden kurulum kapısı. Kök layout ağacı çizmeden ÖNCE bunu bekler; `deviceStore`un her
 * okuma/yazması da aynı sözü bekler — hangi yol önce koşarsa koşsun temizlik okumadan öncedir.
 */
export function ensureFreshInstall(): Promise<void> {
  guard ??= runFreshInstallGuard();
  return guard;
}

/**
 * SecureStore'a açılan tek kapı — supabase-js'in beklediği storage sözleşmesiyle birebir aynı
 * şekle sahiptir, o yüzden oturum adaptörü de bu nesnedir (ikinci bir köprü yazılmadı).
 * `key` dizgedir çünkü supabase-js kendi türev anahtarını (`-code-verifier`) da buradan geçirir.
 */
export const deviceStore = {
  getItem: async (key: string): Promise<string | null> => {
    await ensureFreshInstall();
    return SecureStore.getItemAsync(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    await ensureFreshInstall();
    await SecureStore.setItemAsync(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    await ensureFreshInstall();
    await SecureStore.deleteItemAsync(key);
  },
};
