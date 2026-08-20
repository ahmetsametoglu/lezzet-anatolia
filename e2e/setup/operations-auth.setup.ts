import { test as setup, expect } from '@playwright/test';
import { OPERATIONS_STORAGE_STATE } from './paths';

/**
 * OPERASYON OTURUMU — e2e'nin personel girişi (denetim, 19.08).
 *
 * ── NEDEN VAR ───────────────────────────────────────────────────────────────
 * Operasyon dumanları 04.08'den beri `/operations`'a **giriş adımı olmadan** gidiyordu; açan şey
 * `guard.ts`in dev auth bypass'ıydı. O bypass 19.08'de söküldü (gerekçe guard'ın künyesinde:
 * ölçüldü, oturumsuz `/operations` yerelde 200 dönüyordu ve guard'ın koruduğu şey yerelde hiç
 * denenmiyordu). Yani bu dosya bir kolaylık değil, sökülen şeyin YERİNE GEÇENİ.
 *
 * ── NEDEN `/auth/dev-login` ──────────────────────────────────────────────────
 * Mail turunu atlar ama kurduğu oturum GERÇEKTİR (rotanın künyesi): magic-link jetonu üretilir,
 * SSR istemcisinde tüketilir, çerez normal girişin yazdığının aynısıdır. Guard'a dokunmaz — yani
 * duman koşusu production'daki yetki gerçekliğinin AYNISINI görür. Bypass'la farkı tam da buydu.
 *
 * ── HANGİ HESAP ─────────────────────────────────────────────────────────────
 * Seed'in yöneticisi (`scripts/seed/people.ts` → `yonetici`). Tek hesap yeter, çünkü bugünkü
 * operasyon dumanları rol AYRIMINI sınamıyor. Rol yönlendirmesi senaryosu (`e2e/README` kapsam
 * listesinde "dışarıda kalanlar" altındaydı, gerekçesi *"dev bypass TEK kimlik verir"*) artık
 * yazılabilir hâle geldi: bu dosya çoğaltılıp kurye/depo durumu da saklanabilir.
 *
 * Kapı kapalıysa (env eksik) koşu ADLI hatayla düşer — sessizce oturumsuz devam edip dumanları
 * anlaşılmaz bir yetki hatasıyla kızartmaktansa, sebebi ilk satırda söylemek.
 */
const OPERATIONS_EMAIL = 'yonetim@lezzetanatolia.fr';

setup('operasyon oturumu açılır ve saklanır', async ({ page }) => {
  const response = await page.goto(`/auth/dev-login?email=${encodeURIComponent(OPERATIONS_EMAIL)}&next=/operations`, {
    waitUntil: 'domcontentloaded',
  });

  // 404 = kapı kapalı (`DEV_LOGIN_ENABLED` / `NEXT_PUBLIC_SITE_URL` — kilitler `dev-login-gate`te).
  expect(
    response?.status(),
    'hızlı giriş kapısı kapalı: apps/web/.env.local içinde DEV_LOGIN_ENABLED=true ve NEXT_PUBLIC_SITE_URL yerel olmalı',
  ).not.toBe(404);

  // Hedefe GERÇEKTEN varıldı mı: guard geçilmediyse layout girişe geri atar ve URL orada kalır.
  await expect(page).toHaveURL(/\/operations(\/|$)/, { timeout: 30_000 });
  await expect(page.locator('a[href^="/operations"]').first()).toBeVisible({ timeout: 30_000 });

  await page.context().storageState({ path: OPERATIONS_STORAGE_STATE });
});
