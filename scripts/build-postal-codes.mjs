#!/usr/bin/env node
/**
 * Posta kodu referans tablosunun verisini GeoNames dökümünden (CC-BY 4.0) `0034_postal_code_place_data.sql`e üretir; şema elle
 * bakılan `0033`te durur, çünkü üretilen dosyaya elle yazılan her şey bir sonraki üretimde sessizce geri alınır. Veri migration'ın
 * içindedir, çünkü tablo boşken her kod "tanınmadı"ya düşer ve arıza şema değil veri hatası gibi görünür.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Hangi ülkelerin kodları çekilir — hizmet verilen/verilecek ülkeler (`CountryEnum` ile aynı küme). */
const COUNTRIES = ['FR', 'DE'];
const OUTPUT = join(dirname(fileURLToPath(import.meta.url)), '../supabase/migrations/0034_postal_code_place_data.sql');
/** Tek `insert` deyimine kaç satır — çok büyük deyim planlayıcıyı yorar, çok küçüğü dosyayı şişirir. */
const CHUNK = 500;

/**
 * GeoNames sütun düzeni (postal dökümü): 1=ülke 2=kod 3=yer 10=enlem 11=boylam; dosyada başlık satırı olmadığı için sırayla
 * okunur. İdari birim sütunları okunmaz, çünkü çok yerleşimli kodda üst birimin adı yanlış belediyeyi gösterir.
 */
const COL = { country: 0, postalCode: 1, placeName: 2, lat: 9, lng: 10 };

function download(country, dir) {
  const zip = join(dir, `${country}.zip`);
  execFileSync('curl', ['-sSf', '--max-time', '120', '-o', zip, `https://download.geonames.org/export/zip/${country}.zip`]);
  execFileSync('unzip', ['-oq', zip, '-d', dir]);
  return readFileSync(join(dir, `${country}.txt`), 'utf8');
}

/** Karşılaştırma için ad normalizasyonu: `@lezzet/address` `normalizePlaceName`in betik karşılığı, ikisi aynı kalmalı. */
const norm = (s) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/œ/gi, 'oe')
    .replace(/æ/gi, 'ae')
    .replace(/ß/g, 'ss')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Kodun merkez noktası, yerleşimlerinin ortalaması: harita kod başına tek işaret basar ve birini seçmek keyfi olurdu. Altı hane
 * (~10 cm) yeterli ve sabit, çünkü kayan nokta artığı her üretimde anlamsız diff doğururdu.
 */
function centerOf(rows) {
  const points = rows
    .map((r) => [Number(r[COL.lat]), Number(r[COL.lng])])
    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
  if (points.length === 0) return null;
  const mean = (i) => points.reduce((t, p) => t + p[i], 0) / points.length;
  return [mean(0).toFixed(6), mean(1).toFixed(6)];
}

/**
 * Kodun kapsadığı bütün yerleşimler, indirgenmeden: üst idari birimin adı yanlış belediyeyi gösterir (67800 Strasbourg değil,
 * Bischheim / Hœnheim'dır) ve gösterilecek adı `placeLabel` türetir. Arrondissement türevi ("Paris 11") gövdesi listede olduğu
 * için elenir, yoksa 75011 çok yerleşimli görünürdü.
 */
function placesFor(rows) {
  const names = [...new Set(rows.map((r) => r[COL.placeName]).filter(Boolean))];
  const base = new Set(names.map(norm));
  const communes = names.filter((n) => {
    const derived = norm(n).match(/^(.*?) \d+$/);
    return !(derived && base.has(derived[1]));
  });
  // Sıra DETERMİNİSTİK: üreteç iki kez koşturulduğunda aynı dosya çıkmalı, yoksa anlamsız diff'ler
  // gerçek değişikliği gizler.
  return communes.sort((a, b) => a.localeCompare(b, 'fr'));
}

function parse(text) {
  const byCode = new Map();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const cols = line.split('\t');
    const code = cols[COL.postalCode]?.trim();
    // Yalnız 5 haneli kodlar: GeoNames FR dökümünde CEDEX ve askeri kodlar da var, onlar bir
    // adrese değil bir posta kutusuna işaret eder — teslimat yeri çözümünde karşılığı yok.
    if (!code || !/^\d{5}$/.test(code)) continue;
    const list = byCode.get(code);
    if (list) list.push(cols);
    else byCode.set(code, [cols]);
  }
  return byCode;
}

const quote = (s) => `'${s.replace(/'/g, "''")}'`;

const dir = mkdtempSync(join(tmpdir(), 'geonames-'));
try {
  const rows = [];
  for (const country of COUNTRIES) {
    const byCode = parse(download(country, dir));
    let multi = 0;
    let noPoint = 0;
    for (const [code, group] of [...byCode].sort(([a], [b]) => a.localeCompare(b))) {
      const places = placesFor(group);
      if (places.length > 1) multi++;
      const center = centerOf(group);
      if (!center) noPoint++;
      const point = center ? `${center[0]}, ${center[1]}` : 'null, null';
      rows.push(`('${country}', '${code}', array[${places.map(quote).join(', ')}], ${point})`);
    }
    process.stdout.write(
      `${country}: ${byCode.size} kod (${multi} çok yerleşimli → tek ad yok, ${noPoint} koordinatsız)\n`,
    );
  }

  const chunks = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    chunks.push(
      `insert into public.postal_code_place (country, postal_code, places, lat, lng) values\n${rows.slice(i, i + CHUNK).join(',\n')};`,
    );
  }

  writeFileSync(
    OUTPUT,
    `-- 0034 — Posta kodu referans VERİSİ (19.8 · 02.11)
--
-- ÜRETİLMİŞ DOSYA — elle düzenlenmez, okunmaz, gözden geçirilmez.
-- Kaynak: \`scripts/build-postal-codes.mjs\` (\`pnpm postal:build\`).
-- Veri: GeoNames posta kodu dökümü, CC-BY 4.0.
--
-- **Şemadan neden AYRI** (denetim P1): tablo tanımı + 16.878 satırlık insert tek dosyada 1,8 MB
-- ediyordu (≈450k token) ve dosyayı açan bir AI aracının bağlam bütçesi anında bitiyordu. Dosya
-- kendisiyle de çelişiyordu: başlığı "elle düzenlenmez" diyor, ama şema yorumları elle bakılan
-- metindi — ve fiilen elle düzenlendiler (19.19 \`text_pattern_ops\` düzeltmesi üretece değil
-- ÇIKTIYA yazılmıştı, yani bir sonraki \`postal:build\` onu sessizce geri alacaktı).
--
-- Şema \`0033_postal_code_place.sql\`'te ve ELLE bakılır; burada yalnız veri var. Üreteç artık
-- YALNIZ bu dosyayı yazıyor: ürettiği dosyada elle bakılacak tek satır yok, kayma yüzeyi sıfır.

${chunks.join('\n\n')}
`,
    'utf8',
  );
  process.stdout.write(`→ ${rows.length} satır yazıldı: supabase/migrations/0034_postal_code_place_data.sql\n`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
