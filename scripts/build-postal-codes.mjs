#!/usr/bin/env node
/**
 * Posta kodu referans tablosunun migration'ını ÜRETİR (19.8).
 *
 * Kaynak: GeoNames posta kodu dökümü (CC-BY 4.0, https://download.geonames.org/export/zip/).
 * Çıktı: `supabase/migrations/0044_postal_code_place.sql` — tablo + veri, TEK dosyada.
 *
 * **Veri neden migration'ın içinde?** Bu tablo boşken sistem sessizce yanlış çalışır: her posta
 * kodu "tanınmadı" hâline düşer, ülke çözülemez, kargo deposu bulunamaz. Yani veri opsiyonel bir
 * yükleme değil, tablonun tanımının parçası. Ayrı bir "referans yükle" adımı bırakırsak o adım bir
 * gün unutulur ve arıza şema hatası gibi değil, veri hatası gibi görünür (WORKFLOW §3'ün seed
 * istisnası buraya UYMAZ — seed örnek veridir, bu üretim verisidir).
 *
 * **Ne zaman çalıştırılır:** yılda bir (GeoNames güncellemesi) ya da yeni ülke açılırken. Üretilen
 * dosya repoda durur; bu betik onu yeniden üretir. `pnpm postal:build`
 *
 * Ölçüm (01.08): FR 6.065 + DE 10.813 kod, **610'u iki ülkede birden geçerli** — yani her on
 * Fransız kodundan biri. (Ham dosyada FR 20.418 farklı değer görünür; aradaki fark CEDEX
 * kayıtlarıdır — `01001 CEDEX` bir adrese değil posta kutusuna işaret eder, teslimat yeri
 * çözümünde karşılığı yoktur ve aşağıda elenir.)
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Hangi ülkelerin kodları çekilir — hizmet verilen/verilecek ülkeler (`CountryEnum` ile aynı küme). */
const COUNTRIES = ['FR', 'DE'];
const OUTPUT = join(dirname(fileURLToPath(import.meta.url)), '../supabase/migrations/0044_postal_code_place.sql');
/** Tek `insert` deyimine kaç satır — çok büyük deyim planlayıcıyı yorar, çok küçüğü dosyayı şişirir. */
const CHUNK = 500;

/**
 * GeoNames sütun düzeni (postal dökümü): 1=ülke 2=kod 3=yer 4=idari-1 6=idari-2.
 * Alan adlarıyla değil sırayla okunur — dosyada başlık satırı yok.
 */
const COL = { country: 0, postalCode: 1, placeName: 2, admin1: 3, admin2: 5, admin3: 7 };

function download(country, dir) {
  const zip = join(dir, `${country}.zip`);
  execFileSync('curl', ['-sSf', '--max-time', '120', '-o', zip, `https://download.geonames.org/export/zip/${country}.zip`]);
  execFileSync('unzip', ['-oq', zip, '-d', dir]);
  return readFileSync(join(dir, `${country}.txt`), 'utf8');
}

/**
 * Kod → gösterilecek TEK ad.
 *
 * Bir posta kodu birden çok yerleşimi kapsayabilir (FR'de 4.289, DE'de 2.392 kod öyle; 51300 tek
 * başına 46 köy). Bunlardan birini seçmek keyfi olurdu ve yanlış köyü yazmak, uydurulmuş şehir adı
 * yazmakla aynı güven kaybıdır (`place-types.ts`). Bu yüzden birden çok yer varsa bir üst idari
 * birime çıkılır: 51300 → "Marne". Daha geniş, ama ASLA yanlış değil.
 */
function pickName(rows) {
  const names = [...new Set(rows.map((r) => r[COL.placeName]).filter(Boolean))];
  if (names.length === 1) return names[0];
  // En DAR üst birimden başla: FR'de admin3 = arrondissement, DE'de Kreis (67240 →
  // "Haguenau-Wissembourg", 77694 → "Ortenaukreis"). admin2 departman/bölgedir ve çok geniş kalır
  // ("Bas-Rhin" müşteriye kendi yerini tanıtmaz). İlk satırı seçmek cazip ama güvenilmez: 67240'ta
  // ana yerleşim (Bischwiller) ilk sırada, 51300'de (Vitry-le-François) ikinci sırada.
  for (const col of [COL.admin3, COL.admin2, COL.admin1]) {
    const value = rows.find((r) => r[col])?.[col];
    if (value) return value;
  }
  return names.sort()[0];
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
    for (const [code, group] of [...byCode].sort(([a], [b]) => a.localeCompare(b))) {
      rows.push(`('${country}', '${code}', ${quote(pickName(group))})`);
    }
    process.stdout.write(`${country}: ${byCode.size} kod\n`);
  }

  const chunks = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    chunks.push(
      `insert into public.postal_code_place (country, postal_code, place_name) values\n${rows.slice(i, i + CHUNK).join(',\n')};`,
    );
  }

  writeFileSync(
    OUTPUT,
    `-- 0044 — Posta kodu referansı (19.8)
--
-- ÜRETİLMİŞ DOSYA — elle düzenlenmez. Kaynak: \`scripts/build-postal-codes.mjs\` (\`pnpm postal:build\`).
-- Veri: GeoNames posta kodu dökümü, CC-BY 4.0 (https://download.geonames.org/export/zip/).
--
-- NEDEN VAR: müşteriye "önce ülke, sonra posta kodu" sordurmamak için. Ülke bir ALAN değil, posta
-- kodundan türeyen bir SONUÇtur. İki gerekçe:
--   1. Sürtünme — ülke sormak, cevabı zaten elimizde olan bir soruyu sormaktır.
--   2. Vergi — serbestçe seçilen ülke KDV oranını ve Alman B2B muafiyetini etkiler (DOMAIN §5).
--      Müşterinin doldurduğu bir alanın vergi sonucu doğurması kabul edilemez.
--
-- KAPSAM: yalnız ülke ayrımı ve gösterilecek yer adı. Adres DOĞRULAMA değil — sokak/numara
-- doğruluğu bu tablonun işi değildir ve olmayacaktır.
--
-- ÖLÇÜM (01.08): FR 6.065 + DE 10.813 kod; **610'u iki ülkede birden geçerli** — FR kodlarının
-- %10,1'i, DE'nin %5,6'sı. Bugünkü rota kodlarımız çakışmıyor ama çakışmalar tam genişleme
-- koridorunda: Bas-Rhin ile Rheinland-Pfalz aynı \`67\` önekini paylaşıyor
-- (67240 Bischwiller ↔ Bobenheim-Roxheim, 67150 Nordhouse ↔ Niederkirchen).

create table public.postal_code_place (
  country       country_code not null,
  postal_code   text not null,
  -- Gösterilecek ad. Kod tek yerleşim kapsıyorsa onun adı; birden çoksa bir üst idari birim
  -- (51300 → "Marne"), çünkü 46 köyden birini seçmek keyfi olurdu. Daha geniş, ama asla yanlış
  -- değil — uydurulmuş şehir adı yazmama kuralının (\`place-types.ts\`) veri tarafındaki karşılığı.
  place_name    text not null,
  -- PK ülkeyi İÇERİR: aynı kod iki ülkede geçerli olabilir ve ikisi de doğrudur. Tekil anahtar
  -- sadece koddan oluşsaydı 610 kod birbirini ezerdi.
  primary key (country, postal_code)
);

comment on table public.postal_code_place is
  'Posta kodu → ülke + yer adı referansı (GeoNames, CC-BY). Üretilmiş veri; kaynağı scripts/build-postal-codes.mjs.';

-- Koddan ÜLKEYE gidiş bu tablonun asıl sorgusu: "67000 hangi ülke(ler)de geçerli?" PK ülkeyle
-- başladığı için o yönde kullanılamaz, ayrı indeks gerekir.
create index postal_code_place_code on public.postal_code_place (postal_code);

-- Referans verisi herkese açık okunur: yer çözümü giriş yapmamış ziyaretçi için de çalışır ve
-- burada kişisel veri yoktur (kamuya açık coğrafi liste).
alter table public.postal_code_place enable row level security;
create policy postal_code_place_read on public.postal_code_place for select using (true);

${chunks.join('\n\n')}
`,
    'utf8',
  );
  process.stdout.write(`→ ${rows.length} satır yazıldı: supabase/migrations/0044_postal_code_place.sql\n`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
