import * as SecureStore from 'expo-secure-store';
import { z } from 'zod';
import { LOCALES } from '@lezzet/i18n';

/*
  ONBOARDING DEPOSU — ilk açılış akışının cihazda kalan izi: gösterildi mi (`done`), hangi dil
  seçildi (`locale`), hangi posta kodu yazıldı (`postalCode`).

  NEDEN SECURESTORE: projede kurulu tek yerel anahtar-değer deposu bu (ÖLÇÜLDÜ — package.json'da
  AsyncStorage yok; oturum da aynı depoda, `lib/auth/session-store.ts`). Veri sır değil ama ikinci
  bir depo paketi açmak, tek tercih uğruna yeni bir bağımlılık ve ikinci bir saklama kapısı
  demekti. Oturum deposuyla aynı desen: TEK anahtar, TEK JSON — iki anahtara bölmek aynı verinin
  iki kopyasını ve ayrışma riskini doğururdu (CLAUDE §1).

  ŞEMA BURADA, `packages/types`TA DEĞİL: bu bir alan sözleşmesi değil, CİHAZ-YEREL saklama
  şeklidir — tek okuyanı ve tek yazanı bu modül (sayfaya-özel tip kuralının lib karşılığı).
  Zod'la doğrulanır çünkü depodan dönen değer bizim yazdığımız değer olmayabilir (eski sürüm,
  bozuk kayıt); bozuk kayıt "kayıt yok" ile aynı kapıya çıkar, uygulama kararmaz.

  BELLEK YANSIMASI: kök kapının (`use-onboarding-gate.hook.ts`) okuduğu anlık durum burada
  yaşar. `saveOnboarding` ÖNCE belleği günceller, sonra diske yazar — akışı bitiren ekran
  vitrine dönerken kapı eski bayrağı okuyup kullanıcıyı onboarding'e geri fırlatmasın.
*/

/** SecureStore anahtarı — oturum anahtarıyla aynı adlandırma ailesi (`lezzet.*`). */
const ONBOARDING_STORAGE_KEY = 'lezzet.onboarding';

const OnboardingStateSchema = z.object({
  /** Akış tamamlandı ya da atlandı — ikisi de "bir daha gösterme" demek (v3 `onbDone`). */
  done: z.boolean(),
  /**
   * Seçilen dil. Uygulamanın dilini BU ETAPTA DEĞİŞTİRMEZ: dil `deviceLocale()` ile cihazdan
   * çözülüyor; cihaz dilini ezme mekanizması kabuk kararı, ayrı iş. Seçim yalnız saklanır.
   */
  locale: z.enum(LOCALES),
  /** Yazılan posta kodu (0–5 hane); hiç yazılmadıysa `null` — boş dizge "bilgi yok"u gizlerdi. */
  postalCode: z.string().nullable(),
});

export type OnboardingState = z.infer<typeof OnboardingStateSchema>;

/** `undefined` = depo henüz okunmadı; `null` = kayıt yok (ilk açılış). */
export type OnboardingSnapshot = OnboardingState | null | undefined;

let snapshot: OnboardingSnapshot = undefined;
let readStarted = false;
const listeners = new Set<() => void>();

function publish(next: OnboardingState | null): void {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

/**
 * Depodaki kaydı okur. `null` üç hâli birden kapsar: kayıt yok, kayıt bozuk, depo okunamadı —
 * üçünde de doğru davranış aynıdır (onboarding gösterilir), ayırt etmek karar değiştirmezdi.
 */
export async function readOnboarding(): Promise<OnboardingState | null> {
  try {
    const raw = await SecureStore.getItemAsync(ONBOARDING_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = OnboardingStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    // Sessizliğin nedeni: mobilde log altyapısı yok (kök layout'un font kapısındaki hükümle aynı,
    // 01-teknoloji §9) ve bu hatanın kullanıcıya söylenecek bir karşılığı yok — akış "ilk açılış"
    // varsayımıyla devam eder, en kötüsü onboarding bir kez daha görünür.
    return null;
  }
}

/** Akışın çıkışında (bitir ya da atla) çağrılır — önce bellek, sonra disk. */
export async function saveOnboarding(state: OnboardingState): Promise<void> {
  publish(state);
  try {
    await SecureStore.setItemAsync(ONBOARDING_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Sessizliğin nedeni: yukarıdaki okumayla aynı (log altyapısı yok). Bellek yansıması bu
    // oturumu zaten taşıyor; yazma düştüyse bedeli sonraki açılışta onboarding'in bir kez daha
    // görünmesi — kilitlenmekten ucuz.
  }
}

/**
 * Kapının aboneliği — İLK abonelikte depo bir kez okunur (use-me deseninin sadeleşmiş hâli;
 * bayrak cihaz ömrü boyunca sabit olduğu için abonelik düşünce yeniden okuma kurulmaz).
 */
export function subscribeOnboarding(listener: () => void): () => void {
  if (!readStarted) {
    readStarted = true;
    void readOnboarding().then((stored) => {
      // Okuma sürerken bir kayıt yazıldıysa (yarış) taze olan kazanır, eski disk değeri ezmez.
      if (snapshot === undefined) publish(stored);
    });
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getOnboardingSnapshot(): OnboardingSnapshot {
  return snapshot;
}
