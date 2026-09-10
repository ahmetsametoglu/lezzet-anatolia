/**
 * Görsel ölçüsü DOLGUSU — `pnpm images:dims` (05.37, 09.09).
 *
 * `image_width/height` kolonları 09.09'da açıldı; yükleme yolu artık ölçüyü dosyayla birlikte
 * yazıyor. Ondan önce yüklenmiş satırlar (ve seed'in yüklediği görseller) ölçüsüz: CDN kadrajı
 * (`cropTrim`) kaynak oranını istediği için o satırlar CSS yoluna düşüyor. Bu betik ölçüsüz satırları
 * bulur, ölçüyü CDN'den sorar (`/cdn-cgi/image/format=json/…` görselin en-boyunu döndürür — sunucuda
 * görsel çözücü YOK, bilinçli) ve yazar. Tekrar koşmak güvenli: yalnız boş satırlara dokunur.
 *
 * Seed de aynı fonksiyonu çağırır (`scripts/seed/shared.ts`): tazelenen veritabanı ölçüsüz doğmaz.
 */
import { serviceDb } from '@lezzet/database';
import { cdnImageUrl } from '@lezzet/storage';

const load = (process as { loadEnvFile?: (path: string) => void }).loadEnvFile;
try {
  load?.('apps/backend/.env.local');
} catch {
  // Ortamdan gelmiş olabilir; eksikse `serviceDb` adıyla söyler.
}

/** Görsel taşıyan tablolar — kolon adları hepsinde aynı (`ImageMetaSchema`). */
const TABLES = ['category', 'category_image', 'collection', 'product', 'product_image', 'bundle', 'recipe', 'site_image'] as const;

interface Row {
  id: string;
  image_key: string;
  image_updated_at: string | null;
}

async function olc(key: string, version: string | null): Promise<{ width: number; height: number } | null> {
  const url = cdnImageUrl(key, version, { format: 'json' });
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  const meta = (await res.json()) as { width?: number; height?: number };
  return meta.width && meta.height ? { width: meta.width, height: meta.height } : null;
}

export async function backfillImageDimensions(): Promise<{ written: number; skipped: number }> {
  const db = serviceDb();
  let written = 0;
  let skipped = 0;
  for (const table of TABLES) {
    const { data, error } = await db.from(table).select('id,image_key,image_updated_at').is('image_width', null).not('image_key', 'is', null);
    if (error) throw new Error(`${table}: ${error.message}`);
    for (const row of (data ?? []) as Row[]) {
      const olcu = await olc(row.image_key, row.image_updated_at);
      if (!olcu) {
        skipped += 1;
        continue;
      }
      const { error: e } = await db.from(table).update({ image_width: olcu.width, image_height: olcu.height }).eq('id', row.id);
      if (e) throw new Error(`${table}/${row.id}: ${e.message}`);
      written += 1;
    }
  }
  return { written, skipped };
}

if (process.argv[1]?.endsWith('image-dims-backfill.ts')) {
  backfillImageDimensions()
    .then(({ written, skipped }) => {
      console.log(`görsel ölçüsü: ${written} satır yazıldı, ${skipped} ölçülemedi (CDN yok ya da dosya çözülemedi)`);
    })
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
