/**
 * `pnpm seed:coverage` — seed hangi senaryoyu ÜRETMİYOR?
 *
 * Matris ve gerekçeler `scripts/seed/coverage.ts`'te; burası yalnız koşucu ve rapor.
 *
 * **Çıkış kodu 1 = zorunlu bir kova boş.** Yani "seed geçti" demek artık "tablolar doldu" değil,
 * "her ekranın sınanabileceği hâl var" demek. Kapsamın daralması bundan sonra bir KARAR olur
 * (kovayı zorunludan çıkarıp gerekçesini yazmak), bir kaza değil.
 */
import { createServiceRoleClient } from '@lezzet/database';
import { kapsamOl } from './seed/coverage';

/**
 * **`.env` ELLE yüklenir — `seed.ts` ile aynı gerekçe ve aynı satır.**
 *
 * Bu betik Next.js dışında koşuyor, yani `.env` kendiliğinden yüklenmiyor. İlk yazımda bu blok
 * YOKTU ve kusur benim koşularımda görünmedi: değişkenleri kabuğa elle veriyordum. Kullanıcının
 * `pnpm db:refresh` penceresinde seed tamamlandı, hemen ardından bu betik ham bir yığın iziyle
 * düştü (*"Supabase env eksik"*) — yani tazeleme başarılıydı ama komut kırmızı bitti.
 *
 * **Ders:** bir betiği yalnız kendi hazırladığın ortamda denemek, onu denememektir. Kapsam
 * denetiminin kendisi de bir betik ve o da aynı kurala tabi.
 *
 * Yükleme `createServiceRoleClient` ÇAĞRISINDAN önce olmak zorunda: istemci env'i okuma anında
 * doğruluyor, sonra yüklenen bir dosya onu kurtarmıyor.
 */
try {
  (process as { loadEnvFile?: (path: string) => void }).loadEnvFile?.('.env');
} catch {
  // .env yoksa ortam değişkenleri zaten tanımlı olabilir (CI, elle export).
}

const db = createServiceRoleClient();
const { satirlar, bosZorunlular, kdvOranlari } = await kapsamOl(db);

let sonAlan = '';
for (const s of satirlar) {
  if (s.alan !== sonAlan) {
    console.log(`\n── ${s.alan}`);
    sonAlan = s.alan;
  }
  const isaret = s.sayi === 0 ? (s.zorunlu ? '✗' : '·') : '✓';
  console.log(`   ${isaret} ${s.kova.padEnd(24)} ${String(s.sayi).padStart(5)}${s.zorunlu ? '' : '   (bilgi)'}`);
}

console.log(`\n── Ürün KDV oranları: ${JSON.stringify(kdvOranlari)}`);

if (bosZorunlular.length === 0) {
  console.log(`\n✔ kapsam tam — ${satirlar.length} kovanın hepsinde örnek var`);
  process.exit(0);
}

console.log(`\n✗ ${bosZorunlular.length} ZORUNLU kova BOŞ — bu hâller seed'de hiç doğmuyor:\n`);
for (const b of bosZorunlular) console.log(`   · ${b.alan} → ${b.kova}`);
console.log(
  '\nHer biri bir ekranın ya da bir iş kuralının sınanamaması demek.' +
    '\nYa seed o hâli üretsin, ya kova `scripts/seed/coverage.ts` içinde GEREKÇESİYLE zorunludan çıksın.',
);
process.exit(1);
