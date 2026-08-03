#!/usr/bin/env node
/**
 * Posta kodu referans tablosunun migration'ını ÜRETİR (19.8).
 *
 * Kaynak: GeoNames posta kodu dökümü (CC-BY 4.0, https://download.geonames.org/export/zip/).
 * Çıktı: `supabase/migrations/0034_postal_code_place_data.sql` — **YALNIZ VERİ.**
 *
 * **Şema burada DEĞİL, `0033_postal_code_place.sql`'de ve elle bakılıyor** (02.11 · denetim P1).
 * Eskiden ikisi tek dosyadaydı ve iki sorun doğurdu:
 *   1. 1,8 MB (≈450k token) — dosyayı açan bir AI aracının bağlam bütçesi anında bitiyordu.
 *   2. Dosya kendisiyle çelişiyordu: başlığı "elle düzenlenmez" diyor ama şema yorumları elle
 *      bakılan metindi. Nitekim elle düzenlendiler — 19.19'un `text_pattern_ops` düzeltmesi
 *      (`like '672%'`: 36,9 ms → 0,11 ms) ÜRETECE değil ÇIKTIYA yazılmıştı, yani bir sonraki
 *      `postal:build` onu sessizce geri alacaktı. Ölçülmüş bir kazanç, tek komutla kaybolacaktı.
 *
 * Üreteç artık şema hakkında hiçbir şey bilmiyor: ürettiği dosyada elle bakılacak tek satır yok,
 * yani kayma yüzeyi sıfır.
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
 * Ölçüm (02.08): FR 6.065 + DE 10.813 kod, **610'u iki ülkede birden geçerli** — yani her on
 * Fransız kodundan biri. (Ham dosyada FR 20.418 farklı değer görünür; aradaki fark CEDEX
 * kayıtlarıdır — `01001 CEDEX` bir adrese değil posta kutusuna işaret eder, teslimat yeri
 * çözümünde karşılığı yoktur ve aşağıda elenir.)
 *
 * Yerleşim sayısı (19.17): toplam 60.496 kayıt; kodların **6.650'si (~%39) çok yerleşimli** —
 * FR 4.258 + DE 2.392. En kalabalık kod 55 yerleşim taşıyor.
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
 * GeoNames sütun düzeni (postal dökümü): 1=ülke 2=kod 3=yer 10=enlem 11=boylam.
 * Alan adlarıyla değil sırayla okunur — dosyada başlık satırı yok.
 *
 * İdari birim sütunları (admin1-3) artık OKUNMUYOR: 19.8 çok yerleşimli kodda oraya çıkıyordu ve
 * ürettiği ad yanlıştı (bkz. `placesFor`).
 */
const COL = { country: 0, postalCode: 1, placeName: 2, lat: 9, lng: 10 };

function download(country, dir) {
  const zip = join(dir, `${country}.zip`);
  execFileSync('curl', ['-sSf', '--max-time', '120', '-o', zip, `https://download.geonames.org/export/zip/${country}.zip`]);
  execFileSync('unzip', ['-oq', zip, '-d', dir]);
  return readFileSync(join(dir, `${country}.txt`), 'utf8');
}

/** Karşılaştırma için ad normalizasyonu — `domain-core/delivery/place-name`'in betik karşılığı. */
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
 * Kod → o kodun KAPSADIĞI TÜM YERLEŞİMLER (19.17).
 *
 * ── ESKİ KURAL NEDEN KALDIRILDI ──────────────────────────────────────────────
 * 19.8 çok yerleşimli kodda bir üst idari birime çıkıyor ve *"daha geniş, ama ASLA yanlış değil"*
 * diyordu. İddia yanlıştı: Fransız arrondissement'ı çoğu zaman merkez kasabasının adını taşır, yani
 * üretilen etiket geçerli bir belediye adı gibi okunur. `67800` tabloya "Strasbourg" diye yazılmıştı
 * — orası Bischheim / Hœnheim. Geniş bir etiket değil, ayırt edilemeyen bir YANLIŞ.
 *
 * Artık indirgeme yok: liste olduğu gibi taşınır. Gösterilecek ad ondan TÜRETİLİR (`placeLabel`:
 * tek yerleşimse adı, çoksa null) — yani "hangi ad gösterilir" kararı veride değil tek bir saf
 * fonksiyonda durur, ve aynı liste "yazılan şehir bu koda ait mi" sorusunu da cevaplar.
 *
 * ── ARRONDISSEMENT TÜREVİ AYRI BİR YERLEŞİM DEĞİLDİR ─────────────────────────
 * GeoNames Paris/Lyon/Marsilya kodlarında hem sade adı hem numaralı türevini taşır (`75011` →
 * "Paris" + "Paris 11"). Ham sayımla bu kodlar "çok yerleşimli" görünür ve Paris çıplak koda
 * düşerdi — oysa 75011 Paris'tir. Türev, gövdesi listede olan kayıtlardan ibarettir; eleniyor.
 * Ölçüldü: yalnız 30 kodu etkiliyor (Paris + Lyon), ama nüfusça en ağır 30 kod.
 */
/**
 * Kodun MERKEZ NOKTASI (19.18) — kapsadığı yerleşimlerin ortalaması.
 *
 * Bölge kurulumu haritadan yapılıyor (`design/pages/admin-depolar.md`) ve harita kod başına TEK
 * işaret basıyor. Yerleşimlerden birinin noktasını seçmek keyfi olurdu — aynı `place_name` hatasının
 * coğrafi karşılığı. Ortalama, kodun kapsadığı alanın merkezidir ve zaten sorulan soru bu: "bu kod
 * haritanın neresinde".
 *
 * 6 hane ≈ 10 cm — operatörün yol koridoru seçmesi için fazlasıyla yeterli, ve üretimin
 * tekrarlanabilir olması için sabit (kayan nokta artığı diff üretmesin).
 */
function centerOf(rows) {
  const points = rows
    .map((r) => [Number(r[COL.lat]), Number(r[COL.lng])])
    .filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng));
  if (points.length === 0) return null;
  const mean = (i) => points.reduce((t, p) => t + p[i], 0) / points.length;
  return [mean(0).toFixed(6), mean(1).toFixed(6)];
}

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
