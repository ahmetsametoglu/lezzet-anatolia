import { z } from 'zod';
import { LOCALES } from '@lezzet/i18n';
import { CountryEnum } from '@lezzet/types';

import { DEVICE_STORE_KEYS, deviceStore } from '@lezzet/mobile-kit/src/lib/storage/device-store';

/*
  Şema `packages/types`ta değil, çünkü bu bir alan sözleşmesi değil cihaz-yerel saklama şeklidir; tek okuyanı ve yazanı bu modül.
  `saveOnboarding` önce belleği günceller, sonra diske yazar ki akışı bitiren ekran vitrine dönerken kapı eski bayrağı okumasın.
*/

/** Anahtar ailenin sahibinden gelir, çünkü yeniden kurulum kapısı anahtarları orada toplar. */
const ONBOARDING_STORAGE_KEY = DEVICE_STORE_KEYS.onboarding;

const OnboardingStateSchema = z.object({
  /** Akış tamamlandı ya da atlandı; ikisi de "bir daha gösterme" demektir. */
  done: z.boolean(),
  /** Akışın bittiği dil; uygulamanın dil kaynağı değildir, güncel dil `useAppLocale()`dan okunur. */
  locale: z.enum(LOCALES),
  /** Yazılan posta kodu (0–5 hane); hiç yazılmadıysa `null` — boş dizge "bilgi yok"u gizlerdi. */
  postalCode: z.string().nullable(),
  /** Kodun seçilen ülkesi; eski kayıtta yok, o zaman ülke koddan çözülür. */
  country: CountryEnum.nullable().optional(),
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

/** `null` kayıt yok, bozuk ya da okunamadı demektir; üçünde de onboarding gösterilir, ayırt etmek kararı değiştirmezdi. */
export async function readOnboarding(): Promise<OnboardingState | null> {
  try {
    const raw = await deviceStore.getItem(ONBOARDING_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = OnboardingStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    // Sessiz, çünkü mobilde log altyapısı yok ve en kötü sonuç onboarding'in bir kez daha görünmesidir.
    return null;
  }
}

/** Akışın çıkışında (bitir ya da atla) çağrılır — önce bellek, sonra disk. */
export async function saveOnboarding(state: OnboardingState): Promise<void> {
  publish(state);
  try {
    await deviceStore.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Sessiz, çünkü log altyapısı yok; bellek bu oturumu taşır, bedeli sonraki açılışta onboarding'in bir kez daha görünmesidir.
  }
}

/** Depo ilk abonelikte bir kez okunur; bayrak cihaz ömrü boyunca sabit olduğu için abonelik düşünce yeniden okunmaz. */
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
