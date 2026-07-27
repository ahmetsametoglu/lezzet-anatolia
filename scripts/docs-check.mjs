#!/usr/bin/env node
// Doküman ↔ kod tutarlılık denetleyicisi (WORKFLOW §8: "doküman koddan farklıysa kod haklıdır").
//
// Elle yakalanması pahalı olan dört drift'i makine işi yapar:
//   1) DATA_MODEL varlık tablosu ↔ migration kolonları ↔ Zod şema alanları
//   2) Dokümanlarda anılan dosya/paket yollarının gerçekte var olması
//   3) Görev kimliklerinin (NN.k) eksiksiz ve sırasında olması
//   4) build/README durum özetinin görev satırlarıyla güncel olması
//
// Kullanım: `pnpm docs:check` (denetler, hatada 1 döner) · `pnpm docs:sync` (durum özetini yeniden yazar).
// Kural gereği bu betik ASLA doküman metnini "düzeltmez" — yalnız türetilmiş bloğu üretir; gerisini insan/ajan yazar.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIX = process.argv.includes('--fix');
const problems = [];
const note = (m) => problems.push(m);

const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const snake = (s) => s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase());

// ── 1. DATA_MODEL ↔ migration ↔ Zod ────────────────────────────────────────────
// Yalnız üç katmanda da KARŞILIĞI OLAN varlıklar denetlenir: modelde yazılıp henüz kodlanmamış
// varlık bir hata değil (artımlı inşa), ama kodlanmışsa alanları birebir tutmalıdır.
const ENTITIES = [
  { doc: 'Category (kategori)', part: 'katalog', table: 'category', schema: 'category.schema.ts', zod: 'CategorySchema' },
  { doc: 'Collection (koleksiyon)', part: 'katalog', table: 'collection', schema: 'collection.schema.ts', zod: 'CollectionSchema' },
  { doc: 'Product (ürün)', part: 'katalog', table: 'product', schema: 'product.schema.ts', zod: 'ProductSchema' },
  { doc: 'ProductVariant (ürün varyantı)', part: 'katalog', table: 'product_variant', schema: 'product-variant.schema.ts', zod: 'ProductVariantSchema' },
  { doc: 'Price (fiyat)', part: 'katalog', table: 'price', schema: 'price.schema.ts', zod: 'PriceSchema' },
  // Stok ve tedarik (modül 06)
  { doc: 'Stock (stok partisi)', part: 'stok-tedarik', table: 'stock', schema: 'stock.schema.ts', zod: 'StockSchema' },
  { doc: 'Reservation (rezervasyon)', part: 'stok-tedarik', table: 'reservation', schema: 'stock.schema.ts', zod: 'ReservationSchema' },
  { doc: 'StockAdjustment (imha / fire / sayım düzeltmesi)', part: 'stok-tedarik', table: 'stock_adjustment', schema: 'stock-adjustment.schema.ts', zod: 'StockAdjustmentSchema' },
  { doc: 'TemperatureLog (sıcaklık kaydı)', part: 'stok-tedarik', table: 'temperature_log', schema: 'stock-adjustment.schema.ts', zod: 'TemperatureLogSchema' },
  { doc: 'Supplier (tedarikçi)', part: 'stok-tedarik', table: 'supplier', schema: 'supply.schema.ts', zod: 'SupplierSchema' },
  { doc: 'SupplierProduct (ürün–tedarikçi eşlemesi)', part: 'stok-tedarik', table: 'supplier_product', schema: 'supply.schema.ts', zod: 'SupplierProductSchema' },
  { doc: 'PurchaseOrder (tedarik siparişi)', part: 'stok-tedarik', table: 'purchase_order', schema: 'supply.schema.ts', zod: 'PurchaseOrderSchema' },
  { doc: 'PurchaseOrderItem (tedarik siparişi kalemi)', part: 'stok-tedarik', table: 'purchase_order_item', schema: 'supply.schema.ts', zod: 'PurchaseOrderItemSchema' },
  { doc: 'StockIntake (stok girişi / satın alma)', part: 'stok-tedarik', table: 'stock_intake', schema: 'supply.schema.ts', zod: 'StockIntakeSchema' },
  // Müşteri ve sipariş (modül 04/07)
  { doc: 'Address (adres)', part: 'musteri-siparis', table: 'address', schema: 'address.schema.ts', zod: 'AddressSchema' },
  { doc: 'DeliveryZone (rota / teslimat bölgesi)', part: 'musteri-siparis', table: 'delivery_zone', schema: 'delivery-zone.schema.ts', zod: 'DeliveryZoneSchema' },
  { doc: 'Order (sipariş)', part: 'musteri-siparis', table: 'order', schema: 'order.schema.ts', zod: 'OrderSchema' },
  { doc: 'OrderItem (sipariş kalemi)', part: 'musteri-siparis', table: 'order_item', schema: 'order.schema.ts', zod: 'OrderItemSchema' },
  { doc: 'OrderItemBatch (kalem–parti eşlemesi)', part: 'musteri-siparis', table: 'order_item_batch', schema: 'order.schema.ts', zod: 'OrderItemBatchSchema' },
  { doc: 'OrderStatusLog (durum geçiş kaydı)', part: 'musteri-siparis', table: 'order_status_log', schema: 'order.schema.ts', zod: 'OrderStatusLogSchema' },
  { doc: 'Cart (sunucu sepeti)', part: 'musteri-siparis', table: 'cart', schema: 'cart.schema.ts', zod: 'CartSchema' },
  // İşletme ayarı (modül 02)
  { doc: 'Setting (işletme ayarı)', part: 'iletisim-geribildirim', table: 'settings', schema: 'setting.schema.ts', zod: 'SettingSchema' },
];

/**
 * Veri modeli parçasındaki `## Başlık` altındaki **İLK** markdown tablosunun alan adları.
 *
 * Yalnız ilki: bir bölüm alan tablosundan sonra başka tablolar da taşıyabilir (ör. `Setting`
 * bölümündeki varsayılanlar listesi) — hepsi okunursa o satırlar "eksik kolon" diye raporlanır.
 * Bu yüzden tablo, ilk boş satırda biter.
 *
 * SAKLANMAYAN alanlar atlanır: modelde bilerek yazılıp veritabanında bilerek olmayan satırlardır
 * (ör. `Address.in_route`). Ölçüt "türetilir" DEĞİL — `Order.payment_status` da türetilir ama
 * SAKLANIR. Ayrım: tip sütununda `(türetilir)` yazması ya da notta "saklanmaz" geçmesi.
 */
function docFields(md, heading) {
  const start = md.indexOf(`## ${heading}`);
  if (start === -1) return null;
  const end = md.indexOf('\n## ', start + 1);
  const block = md.slice(start, end === -1 ? undefined : end);

  const lines = block.split('\n');
  const first = lines.findIndex((l) => l.startsWith('| Alan'));
  if (first === -1) return [];
  const rest = lines.slice(first);
  const stop = rest.findIndex((l, i) => i > 0 && !l.startsWith('|'));
  const table = stop === -1 ? rest : rest.slice(0, stop);

  return table
    .filter((l) => l.startsWith('| ') && !l.startsWith('| Alan') && !l.startsWith('| ---'))
    .filter((l) => {
      const cols = l.split('|');
      return !/\(türetilir\)/i.test(cols[2] ?? '') && !/saklanmaz/i.test(cols[3] ?? '');
    })
    .map((r) => r.split('|')[1].trim())
    .filter(Boolean);
}

/** Migration dosyalarındaki `create table public.X (...)` gövdesinden kolon adları. */
function tableColumns(sql, table) {
  const m = sql.match(new RegExp(`create table public\\.${table} \\(([\\s\\S]*?)\\n\\);`));
  if (!m) return null;
  return m[1]
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('--') && !/^(primary key|unique|constraint|foreign key|check)\b/i.test(l))
    .map((l) => l.split(/\s+/)[0])
    .filter(Boolean);
}

/** `export const NAME = …` bildiriminin kaynağı (bir sonraki top-level `export`'a kadar). */
function declSource(src, name) {
  const at = src.search(new RegExp(`export const ${name}\\b[^=]*=`));
  if (at < 0) return null;
  const rest = src.slice(at);
  const end = rest.slice(1).search(/\nexport /);
  return end < 0 ? rest : rest.slice(0, end + 1);
}

/** `.object({ … })` gövdesi — parantez DENGELENEREK (iç içe object'ler kesilmesin). */
function objectBody(decl) {
  const at = decl.search(/\.object\(\s*\{/);
  if (at < 0) return null;
  const open = decl.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < decl.length; i++) {
    if (decl[i] === '{') depth++;
    else if (decl[i] === '}' && --depth === 0) return decl.slice(open + 1, i);
  }
  return null;
}

/** Gövdedeki EN ÜST seviye alan adları — girinti derinliğine bakılır (iç içe object alanları hariç). */
function topLevelKeys(body) {
  const rows = [...body.matchAll(/^([ \t]*)([a-zA-Z][a-zA-Z0-9]*)\s*:/gm)].map((m) => ({ indent: m[1].length, key: m[2] }));
  if (rows.length === 0) return [];
  const min = Math.min(...rows.map((r) => r.indent));
  return rows.filter((r) => r.indent === min).map((r) => r.key);
}

/**
 * Zod şemasındaki alan adları (camelCase). `.merge(OtherSchema)` zinciri de İZLENİR — ortak alan
 * grupları ayrı şemada tutulup merge'lenebildiği için (no-duplication; ör. ImageMetaSchema). Merge
 * edilen şema başka dosyada olabilir → `src` tüm şema dosyalarının birleşimidir.
 *
 * Biçime dayanıklı olmalı: `z.object({` ile `z\n  .object({` aynı şeydir ve girinti değişebilir —
 * aksi hâlde şema BULUNAMAZ ve denetim sessizce atlanır (bu kusur bir kez yaşandı).
 */
function zodFields(src, name, seen = new Set()) {
  if (seen.has(name)) return [];
  seen.add(name);
  const decl = declSource(src, name);
  if (!decl) return null;
  const body = objectBody(decl);
  if (body === null) return null;
  const merged = [...decl.matchAll(/\.merge\(\s*([A-Za-z0-9_]+)\s*\)/g)].flatMap((m) => zodFields(src, m[1], seen) ?? []);
  return [...topLevelKeys(body), ...merged];
}

/** Tüm şema dosyalarını birleştirir — `.merge()` başka dosyadaki şemayı işaret edebilir. */
function allSchemaSrc() {
  const dir = 'packages/types/src/schemas';
  return readdirSync(join(ROOT, dir))
    .filter((f) => f.endsWith('.ts'))
    .map((f) => read(`${dir}/${f}`))
    .join('\n');
}

const migrations = readdirSync(join(ROOT, 'supabase/migrations'))
  .filter((f) => f.endsWith('.sql'))
  .map((f) => read(`supabase/migrations/${f}`))
  .join('\n');
const parts = new Map(); // slug -> içerik (varlık tabloları konu dosyalarına bölünmüştür)
for (const f of readdirSync(join(ROOT, 'docs/architecture/data-model'))) {
  if (f.endsWith('.md')) parts.set(f.replace(/\.md$/, ''), read(`docs/architecture/data-model/${f}`));
}

for (const e of ENTITIES) {
  const doc = docFields(parts.get(e.part) ?? '', e.doc);
  const cols = tableColumns(migrations, e.table);
  const zod = zodFields(allSchemaSrc(), e.zod);
  if (!doc) { note(`data-model/${e.part}.md: "## ${e.doc}" başlığı ya da tablosu bulunamadı`); continue; }
  if (!cols || !zod) continue; // henüz kodlanmamış varlık — artımlı inşa, hata değil

  const docSnake = doc.map(snake);
  const zodSnake = zod.map(snake);
  const missInDb = docSnake.filter((f) => !cols.includes(f));
  const extraInDb = cols.filter((c) => !docSnake.includes(c));
  const zodVsDb = zodSnake.filter((f) => !cols.includes(f));
  const dbVsZod = cols.filter((c) => !zodSnake.includes(c));

  // Modelde yazılıp DB'de olmayan alan "planlı eksik" olabilir → uyarı, kırmızı değil.
  if (missInDb.length) note(`[bilgi] ${e.table}: DATA_MODEL'de var, migration'da yok → ${missInDb.join(', ')} (planlıysa modül dosyasında Durum notu olmalı)`);
  if (extraInDb.length) note(`${e.table}: migration'da var, DATA_MODEL'de YOK → ${extraInDb.join(', ')} — kod haklıdır, dokümanı güncelle`);
  if (zodVsDb.length) note(`${e.zod}: şemada var, tabloda yok → ${zodVsDb.join(', ')}`);
  if (dbVsZod.length) note(`${e.zod}: tabloda var, şemada yok → ${dbVsZod.join(', ')}`);
}

// ── 1b. Junction/ara tablolar: metin satırında geçen kolonlar ─────────────────
// Bu tabloların markdown tablosu yoktur (tek satır anlatılır) — kolon adı metinde `backtick`
// içinde geçmelidir; geçmiyorsa doküman koddan geride kalmış demektir.
const JUNCTIONS = [{ part: 'katalog', table: 'product_collections' }];
for (const j of JUNCTIONS) {
  const cols = tableColumns(migrations, j.table);
  const md = parts.get(j.part) ?? '';
  // Tablodan söz eden TÜM satırlar birlikte değerlendirilir (bir yerde tanıtılıp başka yerde anlatılabilir).
  const mentions = md.split('\n').filter((l) => l.includes(`\`${j.table}\``)).join(' ');
  if (!cols || !mentions) continue;
  const missing = cols.filter((c) => !mentions.includes(`\`${c}\``));
  if (missing.length) note(`${j.table}: tabloda var, data-model/${j.part}.md anlatımında yok → ${missing.join(', ')} — kod haklıdır, dokümanı güncelle`);
}

// ── 2. Dokümanlarda anılan yollar gerçekte var mı ──────────────────────────────
// `packages/x`, `apps/web/lib/y.ts` gibi backtick içindeki somut yollar. Planlanan ama henüz
// yazılmamış dosyalar da anılır — bu yüzden yalnız PAKET KÖKLERİ sıkı denetlenir.
const docFiles = [
  ...readdirSync(join(ROOT, 'docs/architecture')).map((f) => `docs/architecture/${f}`),
  ...readdirSync(join(ROOT, 'docs/build')).map((f) => `docs/build/${f}`),
  'CLAUDE.md',
].filter((f) => f.endsWith('.md'));

const referencedPackages = new Set();
for (const f of docFiles) {
  for (const m of read(f).matchAll(/`(packages\/[a-z-]+)`/g)) referencedPackages.add(m[1]);
}
for (const pkg of [...referencedPackages].sort()) {
  if (!existsSync(join(ROOT, pkg))) note(`${pkg} dokümanlarda anılıyor ama repoda yok`);
}

// ── 3. Görev kimlikleri eksiksiz ve sırasında mı ───────────────────────────────
const buildFiles = readdirSync(join(ROOT, 'docs/build')).filter((f) => /^\d\d-.*\.md$/.test(f));
const moduleStats = [];
for (const f of buildFiles) {
  const nn = f.slice(0, 2);
  const src = read(`docs/build/${f}`);
  const lines = src.split('\n').filter((l) => /^- \[[ x~]\]/.test(l));
  let k = 0;
  const counts = { done: 0, partial: 0, open: 0 };
  for (const line of lines) {
    k += 1;
    const id = line.match(/^- \[[ x~]\] \((\d\d)\.(\d+)\)/);
    if (!id) { note(`docs/build/${f}: kimliksiz görev satırı → ${line.slice(0, 60)}…`); continue; }
    if (id[1] !== nn || Number(id[2]) !== k) note(`docs/build/${f}: kimlik sırası bozuk → (${id[1]}.${id[2]}) beklenen (${nn}.${k})`);
    const mark = line[3];
    counts[mark === 'x' ? 'done' : mark === '~' ? 'partial' : 'open'] += 1;
  }
  const title = (src.match(/^# (.+)$/m)?.[1] ?? f).replace(/^\d\d\s*—\s*/, '');
  moduleStats.push({ nn, file: f, title, ...counts, total: lines.length });
}

// ── 4. build/README durum özeti güncel mi ──────────────────────────────────────
const label = (m) =>
  m.total === 0 ? 'planlanıyor' : m.done === m.total ? 'tamam' : m.done + m.partial === 0 ? 'bekliyor' : 'sürüyor';
const table = [
  '| # | Dosya | Kapsam | Durum | Görev |',
  '| --- | --- | --- | --- | --- |',
  ...moduleStats.map((m) => `| ${m.nn} | \`${m.file}\` | ${m.title} | ${label(m)} | ${m.done}/${m.total}${m.partial ? ` (+${m.partial} kısmi)` : ''} |`),
].join('\n');

const readmePath = 'docs/build/README.md';
const readme = read(readmePath);
const BEGIN = '<!-- durum:başlangıç -->';
const END = '<!-- durum:son -->';
const block = `${BEGIN}\n${table}\n${END}`;
if (!readme.includes(BEGIN) || !readme.includes(END)) {
  note(`${readmePath}: durum bloğu işaretleri (${BEGIN} … ${END}) yok`);
} else {
  const current = readme.slice(readme.indexOf(BEGIN), readme.indexOf(END) + END.length);
  if (current !== block) {
    if (FIX) {
      writeFileSync(join(ROOT, readmePath), readme.replace(current, block));
      console.log(`✔ ${readmePath} durum özeti güncellendi`);
    } else {
      note(`${readmePath}: durum özeti bayat — \`pnpm docs:sync\` çalıştır`);
    }
  }
}

// ── Sonuç ─────────────────────────────────────────────────────────────────────
const hard = problems.filter((p) => !p.startsWith('[bilgi]'));
for (const p of problems) console.log((p.startsWith('[bilgi]') ? '· ' : '✗ ') + p);
if (!problems.length) console.log('✔ doküman/kod tutarlı');
if (hard.length) {
  console.log(`\n${hard.length} tutarsızlık. Kural: kod haklıdır — dokümanı düzelt (WORKFLOW §8).`);
  process.exit(1);
}
