/**
 * Seed görsel künyesini YEREL veritabanından yazar — `pnpm images:manifest` (05.37, 14.09).
 *
 * Künyenin ne olduğu ve neden var olduğu `seed/image-manifest.ts`te. Ne zaman koşulur:
 * - `pnpm images:dims` ölçüleri yazdıktan sonra: ölçü künyeye sabitlensin, seed onu bir daha sormasın;
 * - seed "künye dışı görsel var" dediğinde (seed sonu özeti).
 *
 * **`db:refresh`ten ÖNCE koşulur, sonra değil:** tazeleme veritabanındaki sürümleri siler ve künyesiz
 * yüklenen görsele yeni sürüm yazar; sonradan üretilen künye CDN'de önbelleği olmayan adresleri sabitler.
 *
 * Yalnız YEREL hedef — künye yerel seed'in yazdığını anlatır. Veritabanına yazmaz.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServiceRoleClient } from '@lezzet/database';
import { IMAGE_TABLES, kunyeKur, type KunyeSatiri } from './seed/image-manifest';

try {
  (process as { loadEnvFile?: (path: string) => void }).loadEnvFile?.('.env');
} catch {
  // .env yoksa ortam değişkenleri zaten tanımlı olabilir.
}

const NOT =
  'ÜRETİLİR, elle yazılmaz — `pnpm images:manifest` (yerel veritabanından). Anahtar → sürüm (image_updated_at) + ölçü. ' +
  'Seed künyedeki görseli depoda aynı içerikle bulursa yüklemez ve bu değerleri yazar: okuma adresi tazelemeler ' +
  'arasında değişmez, CDN dönüşüm kotası yanmaz. Gerekçe: scripts/seed/image-manifest.ts.';

interface Row {
  image_key: string;
  image_updated_at: string | null;
  image_width: number | null;
  image_height: number | null;
}

async function main(): Promise<void> {
  // `createServiceRoleClient` bu adrese bağlanıyor; ölçüt seed'in `assertLocalDatabase`iyle aynı: host.
  const host = (() => {
    try {
      return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').hostname;
    } catch {
      return '';
    }
  })();
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
    throw new Error(`görsel künyesi yalnız YEREL veritabanından üretilir — hedef: ${host || '(NEXT_PUBLIC_SUPABASE_URL okunamadı)'}`);
  }

  const db = createServiceRoleClient();
  const rows: (KunyeSatiri & { imageKey: string })[] = [];
  for (const table of IMAGE_TABLES) {
    const { data, error } = await db.from(table).select('image_key,image_updated_at,image_width,image_height').not('image_key', 'is', null);
    if (error) throw new Error(`${table}: ${error.message}`);
    for (const r of (data ?? []) as Row[]) {
      rows.push({ imageKey: r.image_key, imageUpdatedAt: r.image_updated_at, imageWidth: r.image_width, imageHeight: r.image_height });
    }
  }

  const kunye = kunyeKur(rows);
  writeFileSync(join(process.cwd(), 'scripts/seed/data/image-manifest.json'), `${JSON.stringify({ _not: NOT, ...kunye }, null, 2)}\n`);
  const satirlar = Object.values(kunye);
  const olculu = satirlar.filter((s) => s.imageWidth !== null).length;
  const surumsuz = satirlar.filter((s) => s.imageUpdatedAt === null).length;
  console.log(`görsel künyesi: ${satirlar.length} anahtar · ${olculu} ölçülü · ${surumsuz} sürümsüz → scripts/seed/data/image-manifest.json`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
