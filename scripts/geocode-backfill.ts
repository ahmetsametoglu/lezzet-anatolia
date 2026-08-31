/**
 * Adres koordinatlarını ELLE doldurur (11.9) — `pnpm geo:backfill`.
 *
 * Cron'un (`geocode_addresses`, on dakikada bir) yaptığı işin aynısını daha büyük partiyle ve hemen
 * yapar: **ayrı bir mantık yok**, aynı fonksiyon çağrılıyor (`CLAUDE §1` — ikinci bir tarayıcı
 * yazmak, aynı sayaç kuralını ikinci kez yazmak olurdu ve ikisi bir gün ayrışırdı).
 *
 * **`db:refresh` sonrası GEREKMEZ** (31.08): besleme koordinatları SABİT yazıyor — BAN'dan bir kez
 * çekilip dosyaya kondular (`seed/delivery.ts` künyesi). Her tazelemeden sonra elle bir komut daha
 * istemek, unutulduğu gün rota sıralamasını sessizce posta kodu merkezine düşürürdü.
 *
 * Bu betik **beslemenin bilmediği** adresler için: uygulamadan girilen, elle yazılan, operasyon
 * panelinden açılan satırlar. Cron aynı işi on dakikada bir zaten yapıyor; bu, beklemek
 * istemeyenin kapısı.
 *
 * **Ağa ÇIKAR** (BAN / Géoplateforme) — bu yüzden bir test değil, elle çalıştırılan bir provadır
 * (`scripts/*-smoke.ts` kardeşleri). Anahtar gerekmez, servis ücretsiz ve açıktır.
 */

(process as { loadEnvFile?: (path: string) => void }).loadEnvFile?.('.env');

import { createServiceRoleClient } from '@lezzet/database';
import { geocodeAddressesScan } from '@lezzet/application';

/** Bir turda kaç satır — cron'un partisinden büyük: burada bekleyen bir insan var. */
const BATCH = 50;
/** Kaç tur — kuyruk boşalınca zaten erken çıkılıyor. */
const MAX_ROUNDS = 40;

async function main(): Promise<void> {
  const db = createServiceRoleClient();
  const total = { scanned: 0, located: 0, noMatch: 0, deferred: 0 };

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const result = await geocodeAddressesScan(db, { limit: BATCH });
    if (result.scanned === 0) break;

    total.scanned += result.scanned;
    total.located += result.located;
    total.noMatch += result.noMatch;
    total.deferred += result.deferred;

    console.log(`  tur ${round + 1}: ${result.scanned} tarandı · ${result.located} çözüldü · ${result.noMatch} eşleşmedi · ${result.deferred} ertelendi`);

    // Hiçbiri çözülmediyse kuyruk ilerlemiyor demektir (hepsi ertelenmiş ya da eşleşmemiş):
    // dönmeye devam etmek servisi boşuna döver.
    if (result.located === 0) break;
  }

  console.log(`✓ ${total.located}/${total.scanned} adres çözüldü (eşleşmeyen: ${total.noMatch}, ertelenen: ${total.deferred})`);
  if (total.deferred > 0) console.log('  ↳ ertelenenler büyük olasılıkla Almanya adresleri: BAN yalnız Fransa (11.9 künyesi).');
}

await main();
