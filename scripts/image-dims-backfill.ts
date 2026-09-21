/**
 * Görsel ölçüsü dolgusu — `pnpm images:dims`. Ölçüsüz satırlar CDN kadrajına giremez ve özgün dosya
 * olarak iner; betik yalnız boş satırlara dokunur, tekrar koşmak güvenlidir.
 *
 * Ölçü özgün dosyanın başlığından okunur, CDN dönüşümüyle sorulmaz: her dönüşüm ücretsiz kotadan düşer.
 * Ardından `pnpm images:manifest` ölçüyü künyeye sabitler, seed onu bir daha sormaz.
 */
import { serviceDb } from '@lezzet/database';
import { publicImageUrl } from '@lezzet/storage';
import { IMAGE_TABLES } from './seed/image-manifest';

const load = (process as { loadEnvFile?: (path: string) => void }).loadEnvFile;
try {
  load?.('apps/backend/.env.local');
} catch {
  // Ortamdan gelmiş olabilir; eksikse `serviceDb` adıyla söyler.
}

interface Row {
  id: string;
  image_key: string;
  image_updated_at: string | null;
}

interface Dimensions {
  width: number;
  height: number;
}

/** PNG · JPEG · WebP başlığından en-boy; tanınmayan biçimde `null` (ölçülemeyen değer sıfır değildir). */
function readImageDimensions(buf: Buffer): Dimensions | null {
  // PNG: imza + IHDR, en-boy 16. bayttan itibaren.
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // JPEG: SOF işaretine kadar segmentler atlanır; DHT (C4), JPG (C8) ve aritmetik tablo (CC) SOF değildir.
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return null;
      const marker = buf[i + 1]!;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
    return null;
  }
  // WebP: RIFF kabı; üç alt biçimin her biri ölçüyü başka yerde ve başka kodlamayla taşır.
  if (buf.length >= 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    if (chunk === 'VP8L') {
      const bits = buf.readUInt32LE(21);
      return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff) };
    }
    if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
  }
  return null;
}

async function olc(key: string, version: string | null): Promise<Dimensions | null> {
  const url = publicImageUrl(key, version);
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) return null;
  return readImageDimensions(Buffer.from(await res.arrayBuffer()));
}

async function backfillImageDimensions(): Promise<{ written: number; skipped: string[] }> {
  const db = serviceDb();
  let written = 0;
  const skipped: string[] = [];
  for (const table of IMAGE_TABLES) {
    const { data, error } = await db.from(table).select('id,image_key,image_updated_at').is('image_width', null).not('image_key', 'is', null);
    if (error) throw new Error(`${table}: ${error.message}`);
    for (const row of (data ?? []) as Row[]) {
      const olcu = await olc(row.image_key, row.image_updated_at);
      if (!olcu) {
        skipped.push(`${table}/${row.image_key}`);
        continue;
      }
      const { error: e } = await db.from(table).update({ image_width: olcu.width, image_height: olcu.height }).eq('id', row.id);
      if (e) throw new Error(`${table}/${row.id}: ${e.message}`);
      written += 1;
    }
  }
  return { written, skipped };
}

backfillImageDimensions()
  .then(({ written, skipped }) => {
    console.log(`görsel ölçüsü: ${written} satır yazıldı, ${skipped.length} ölçülemedi`);
    for (const s of skipped) console.log(`  ölçülemedi: ${s}`);
  })
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
