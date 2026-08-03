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
  // İndirim listede YOKTU (02.9'da fark edildi): tablosu, doküman satırı ve şeması olan bir varlık
  // denetimin dışında kalmıştı — üç katman ayrışsa kimse görmezdi.
  { doc: 'Discount (indirim / kupon)', part: 'katalog', table: 'discount', schema: 'discount.schema.ts', zod: 'DiscountSchema' },
  { doc: 'DiscountCode (kupon kodu)', part: 'katalog', table: 'discount_code', schema: 'discount.schema.ts', zod: 'DiscountCodeSchema' },
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
  // Operasyon ve gözlemleme (modül 06 · 18) — `error_log`/`system_health_snapshot` henüz kodlanmadı;
  // liste onları BUGÜNDEN tutuyor çünkü kontrol tablo doğunca kendiliğinden devreye girsin (kodlanmamış
  // varlıkta `cols` boş olur ve karşılaştırma atlanır — artımlı inşa, hata değil).
  { doc: 'JobRun (zamanlanmış iş izi)', part: 'operasyon', table: 'job_run', schema: 'job-run.schema.ts', zod: 'JobRunSchema' },
  { doc: 'ErrorLog (hata kaydı)', part: 'operasyon', table: 'error_log', schema: 'error-log.schema.ts', zod: 'ErrorLogSchema' },
  { doc: 'SystemHealthSnapshot (sistem sağlığı anlık görüntüsü)', part: 'operasyon', table: 'system_health_snapshot', schema: 'system-health.schema.ts', zod: 'SystemHealthSnapshotSchema' },
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
  // ÇOK SATIRLI kısıtlar parantez derinliğiyle atlanır. Eskiden yalnız kısıtın İLK satırı
  // eleniyordu; devam satırları (`or (scope = …`, `),`) kolon sanılıp "tabloda var, şemada yok"
  // diye raporlanıyordu. Görünmemesinin tek sebebi böyle bir tablonun denetim listesinde
  // olmamasıydı — yani hata, kendini gizleyen yerde duruyordu (02.9'da `discount` eklenince çıktı).
  const columns = [];
  let depth = 0;
  for (const raw of m[1].split('\n')) {
    const line = raw.trim();
    const inside = depth > 0;
    depth = Math.max(0, depth + (line.match(/\(/g)?.length ?? 0) - (line.match(/\)/g)?.length ?? 0));
    if (inside || !line || line.startsWith('--')) continue;
    if (/^(primary key|unique|constraint|foreign key|check|exclude)\b/i.test(line)) continue;
    columns.push(line.split(/\s+/)[0]);
  }
  return columns.filter(Boolean);
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

const migrationFiles = readdirSync(join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql'));

// ── 0. Migration sürüm numarası TEKİL olmalı ─────────────────────────────────
// Supabase sürümü dosya adının önekinden okur ve UYGULANMIŞ sayar. Aynı numarayı iki dosya
// paylaşırsa ikincisi sessizce atlanır, `db reset` de o noktada yarım kalır — şema eksik kalır ama
// hiçbir yerde "hata" görünmez. 28.07.2026'da iki ajan aynı anda `0024` alınca tam olarak bu oldu.
// Paralel çalışmada numara çakışması kaçınılmazdır; ucuz olan onu commit anında yakalamaktır.
const versions = new Map();
for (const f of migrationFiles) {
  const version = f.slice(0, f.indexOf('_'));
  versions.set(version, [...(versions.get(version) ?? []), f]);
}
for (const [version, files] of versions) {
  if (files.length > 1) note(`migration sürümü ÇAKIŞIYOR (${version}): ${files.join(', ')} — biri yeniden numaralandırılmalı`);
}

const migrations = migrationFiles.map((f) => read(`supabase/migrations/${f}`)).join('\n');
const parts = new Map(); // slug -> içerik (varlık tabloları konu dosyalarına bölünmüştür)
for (const f of readdirSync(join(ROOT, 'docs/architecture/data-model'))) {
  if (f.endsWith('.md')) parts.set(f.replace(/\.md$/, ''), read(`docs/architecture/data-model/${f}`));
}

// ── 1a. Para: `…Cents` şema alanı ↔ euro kolonu, BEYANLA bağlanır (02.9 · STACK §8) ──
// Para DB'de euro `numeric`, uygulamada tamsayı cent. İkisini `BaseDbService.moneyFields` bağlar:
// `amountCents` alanı `amount` kolonunu okur. Bu kural o bağın var olduğunu doğrular — beyansız bir
// `…Cents` alanı, adı doğru ama dönüşümü olmayan bir alandır ve tam da 02.9'un kapattığı hatadır
// (74,17 € ekranda 0,74 € görünmüştü). Ada bakıp "cent'tir" diye güvenmek, güvenceyi süse çevirir.
//
// Göç bitince kural yumuşamaz, SERTLEŞİR: yeni bir para alanı beyansız eklendiği gün burada patlar.
const serviceDir = 'packages/database/src/services';
const serviceSrc = readdirSync(join(ROOT, serviceDir))
  .filter((f) => f.endsWith('.ts'))
  .map((f) => read(`${serviceDir}/${f}`))
  .join('\n');
const declaredCents = new Set();
// Beyan doğrudan bir dizi olabilir (`moneyFields = ['amountCents']`) ya da PAYLAŞILAN bir sabite
// bağlanabilir (`moneyFields = ORDER_MONEY_FIELDS`) — sipariş ailesinde aynı liste hem beyanda hem
// RPC gövdesinin çevriminde kullanılıyor ve iki yerde ayrı yazılması tam da kuralın kapattığı hata.
// Bu yüzden `…MONEY_FIELDS` adlı sabitlerin dizileri de taranır.
for (const decl of serviceSrc.matchAll(/\b(?:moneyFields|[A-Z_]*MONEY_FIELDS)\s*(?::[^=]*)?=\s*\[([^\]]*)\]/g)) {
  for (const field of decl[1].matchAll(/['"]([A-Za-z0-9_]+)['"]/g)) declaredCents.add(field[1]);
}
for (const field of declaredCents) {
  if (!field.endsWith('Cents')) note(`moneyFields beyanı "${field}": para alanı adı Cents ile bitmeli (STACK §8)`);
}
// `…Cents` alanı `dbNumeric` OLAMAZ: dönüşümü taban sınıf yapar, şema tamsayı bekler. `dbNumeric`
// kalmışsa alan euro taşıyor ama cent adı taşıyor demektir — adın yalan söylediği tek durum.
for (const m of allSchemaSrc().matchAll(/([A-Za-z0-9_]*Cents)\s*:\s*dbNumeric/g)) {
  note(`${m[1]}: "…Cents" alanı dbNumeric kullanamaz — dönüşüm moneyFields ile taban sınıfta yapılır (STACK §8)`);
}

/** Şema alanının DB kolonu: beyan edilmiş para alanında `Cents` eki düşer. */
const columnOf = (field) => snake(declaredCents.has(field) ? field.slice(0, -'Cents'.length) : field);

for (const e of ENTITIES) {
  const doc = docFields(parts.get(e.part) ?? '', e.doc);
  const cols = tableColumns(migrations, e.table);
  const zod = zodFields(allSchemaSrc(), e.zod);
  if (!doc) { note(`data-model/${e.part}.md: "## ${e.doc}" başlığı ya da tablosu bulunamadı`); continue; }
  if (!cols || !zod) continue; // henüz kodlanmamış varlık — artımlı inşa, hata değil

  // Beyansız `…Cents` alanı: kolon adı eşleşmez ve aşağıdaki fark listesinde "tabloda yok" diye
  // görünürdü — sebebini söylemeden. Burada adıyla sanıyla söylenir.
  for (const field of zod) {
    if (!field.endsWith('Cents') || declaredCents.has(field)) continue;
    if (cols.includes(snake(field.slice(0, -'Cents'.length)))) {
      note(`${e.zod}.${field}: para alanı ${e.table} servisinin moneyFields beyanında YOK → euro/cent dönüşümü yapılmıyor (STACK §8)`);
    }
  }

  const docSnake = doc.map(snake);
  const zodSnake = zod.map(columnOf);
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

// ── 3b. BEKLEYEN(...) işaretleri geçerli bir kayda mı bağlı ───────────────────
//
// **Neden bir anahtar kelime var** (kod içi `STUB(...)` bir kez terk edilmişken):
// terk edilen şey işaretin ENVANTER olarak kullanılmasıydı ve o karar doğruydu — bir yorum
// "müşteri yüzeyinde neler eksik" sorusunu cevaplayamaz, cevabı her seferinde `grep` ile yeniden
// derlemek gerekir ve her derlemede bir madde atlanır. Nitekim sepetteki kupon kutusu tam böyle
// atlandı (29.07): UI çizildi, hiçbir envantere yazılmadı, hiçbir kontrol fark etmedi.
//
// Buradaki işaret envanter DEĞİL, envantere giden **doğrulanmış bağdır**. İkisi birlikte çalışır:
//   · `design/BACKLOG.md` / `docs/build/NN` → açığın kendisi, gerekçesiyle (insan okur)
//   · `BEKLEYEN(ref)`                      → koddaki yeri (makine bulur, kaydı doğrular)
// Bu yüzden düz `TODO` yasak kalır: kimseye söz vermez, kimse denetlemez, çürür.
//
// Biçim: `BEKLEYEN(08.5): sipariş takip sayfası` ya da `BEKLEYEN(BACKLOG §1): …`
const codeRoots = ['apps/web', 'packages', 'scripts'];
const SKIP_DIR = new Set(['node_modules', '.next', 'dist', '.turbo']);

function walk(dir, out = []) {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (e.name.startsWith('.') && e.name !== '.next') continue;
    if (SKIP_DIR.has(e.name)) continue;
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs|sql)$/.test(e.name)) out.push(p);
  }
  return out;
}

const taskIds = new Set();
/** KAPANMIŞ görevler — bir boşluk işareti bunlara asılamaz (bkz. aşağıdaki kural). */
const closedTaskIds = new Set();
for (const f of buildFiles) {
  for (const m of read(`docs/build/${f}`).matchAll(/^- \[([ x~])\] \((\d\d\.\d+)\)/gm)) {
    taskIds.add(m[2]);
    if (m[1] === 'x') closedTaskIds.add(m[2]);
  }
}
const designBacklog = existsSync(join(ROOT, 'design/BACKLOG.md')) ? read('design/BACKLOG.md') : '';
const backlogSections = new Set([...designBacklog.matchAll(/^## (\d+)\./gm)].map((m) => m[1]));

// ── 3c. TAMAMLANMIŞ görev satırının vaat ettiği şey gerçekten var mı ──────────
//
// Denetim B4'ün sınıfı: satır bir dosya ya da komut TESLİM EDİYOR, karşılığı kodda yok. Kimse
// yalan söylemiyor — iş sırasında yön değişiyor, gerekçe alttaki Durum notuna yazılıyor ve BAŞLIK
// düzeltilmeden kalıyor. Sonuç: satırı okuyup notu okumayan ajan olmayan bir komutu çağırır
// (`pnpm test:purge`) ya da silinmiş bir betiği arar (`repair-discount-shares.mjs`).
//
// CLAUDE.md §5 "durumun tek sahibi görev satırıdır" der; satır yalnız notuyla birlikte doğruysa
// tek sahip değildir. Bu kontrol o sahipliği makineye doğrulatır.
//
// `~~üstü çizili~~` geçen satır atlanır: geri alınan vaat açıkça geri alınmıştır.
const NPM_BUILTINS = new Set(['install', 'add', 'remove', 'exec', 'dlx', 'why', 'update', 'run']);
const pkgScripts = new Set(Object.keys(JSON.parse(read('package.json')).scripts ?? {}));
/** `lib/bank/{import,reconcile}.ts` → iki yol. Kısaltma dokümanda yaygın ve tek yol değildir. */
function expandBraces(path) {
  const m = path.match(/^(.*)\{([^}]+)\}(.*)$/);
  return m ? m[2].split(',').map((part) => `${m[1]}${part.trim()}${m[3]}`) : [path];
}

for (const f of buildFiles) {
  let task = null;
  for (const line of read(`docs/build/${f}`).split('\n')) {
    const head = line.match(/^- \[([ x~])\] \((\d\d\.\d+)\)/);
    if (head) task = { id: head[2], done: head[1] !== ' ' };
    // Açık görev (`[ ]`) bir NİYET beyanıdır — henüz yazılmamış dosyayı adıyla anması normaldir.
    if (!task?.done || line.includes('~~')) continue;

    for (const s of line.matchAll(/`pnpm ([a-z][a-z0-9:-]*)`/g)) {
      if (!NPM_BUILTINS.has(s[1]) && !pkgScripts.has(s[1])) {
        note(`docs/build/${f} (${task.id}): \`pnpm ${s[1]}\` teslim ediliyor ama böyle bir script yok`);
      }
    }
    for (const p of line.matchAll(/`((?:apps|packages|supabase|scripts)\/[^`\s]*\.[a-z]{2,4})`/g)) {
      for (const path of expandBraces(p[1])) {
        if (!existsSync(join(ROOT, path))) {
          note(`docs/build/${f} (${task.id}): \`${path}\` teslim ediliyor ama dosya yok`);
        }
      }
    }
  }
}

let pendingCount = 0;
for (const root of codeRoots) {
  if (!existsSync(join(ROOT, root))) continue;
  for (const file of walk(root)) {
    // Denetleyicinin KENDİSİ taranmaz: buradaki geçişler kuralın örneği, bir borç değil.
    if (file.endsWith('scripts/docs-check.mjs')) continue;
    for (const m of read(file).matchAll(/BEKLEYEN\(([^)]*)\)\s*:\s*(.*)/g)) {
      pendingCount += 1;
      const ref = m[1].trim();
      const what = m[2].trim();
      if (!what) note(`${file}: BEKLEYEN(${ref}) neyi beklediğini yazmıyor`);
      const taskRef = ref.match(/^(\d\d\.\d+)$/);
      const backlogRef = ref.match(/^BACKLOG §(\d+)$/);
      if (taskRef) {
        if (!taskIds.has(taskRef[1])) note(`${file}: BEKLEYEN(${ref}) — böyle bir görev kimliği yok`);
        // KAPANMIŞ göreve asılı işaret = SAHİPSİZ boşluk (denetim B2, 02.08). Kimlik doğru olduğu
        // için eski kontrolden sessizce geçiyordu, ama görev `[x]` olduğu an o satırı kimse bir daha
        // okumaz: boşluk kodda durur, planda durmaz. Ölçüldü — dört işaret bu hâldeydi, biri
        // gerçekten yapılmamış bir işi bekliyordu (`14.3`, oysa iş `17.2`'nin).
        //
        // UYARI, hata DEĞİL — ve bu geçici: bayat işaret çoğu zaman BAŞKA bir şeridin dosyasında
        // duruyor (üçü öyle) ve sert hata üç ajanın commit'ini birden bloklardı. Kalanlar
        // temizlenince eşik sertleşmeli; yumuşak kalan kural bir süre sonra okunmayan kuraldır.
        else if (closedTaskIds.has(taskRef[1])) {
          note(`[bilgi] ${file}: BEKLEYEN(${ref}) — görev KAPANMIŞ ([x]); işaret ya silinmeli ya açık bir göreve taşınmalı`);
        }
      } else if (backlogRef) {
        if (!backlogSections.has(backlogRef[1])) note(`${file}: BEKLEYEN(${ref}) — design/BACKLOG.md'de §${backlogRef[1]} yok`);
      } else {
        note(`${file}: BEKLEYEN(${ref}) — referans "NN.k" ya da "BACKLOG §N" olmalı`);
      }
    }
  }
}
if (pendingCount) console.log(`· ${pendingCount} BEKLEYEN işareti (hepsi bir kayda bağlı)`);

// ── 3c2. Her migration dosyasının index.md'de bir satırı var mı ───────────────
//
// **Denetim bulgusu A5 (03.08).** `supabase/migrations/index.md` 0031'de donmuştu; künyesi eksik
// satırları kendisi tespit edip *"yazan ajanlar tamamlar"* diyordu ve tutulmamıştı — üstelik
// sonraki migration'lardan biri girilmişti, yani disiplin yarım işliyordu (kimi ajan yazıyor, kimi
// yazmıyor). Yumuşak kural okunmayan kuraldır; B2 emsali.
//
// **Türetme DEĞİL kontrol** (denetim görüşü de bu yöndeydi): satırlar tek cümlelik ve elle yazılan
// bağlam taşıyor — "neyin neden taşındığı", "hangi karar bu tabloyu doğurdu". Dosya başlığından
// türetilemez; ama VARLIĞI denetlenebilir.
const migrationDir = 'supabase/migrations';
const migrationIndexPath = `${migrationDir}/index.md`;
if (existsSync(join(ROOT, migrationIndexPath))) {
  const indexSrc = read(migrationIndexPath);
  for (const file of readdirSync(join(ROOT, migrationDir)).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort()) {
    if (!indexSrc.includes(file)) note(`${migrationIndexPath}: ${file} kayıtlı değil — her migration'ın bir satırı olmalı`);
  }
}

// ── 3d. Çalışma-anı bağımlılığı mimari dokümanda BEYAN EDİLMİŞ mi ─────────────
//
// **Denetim bulgusu B2-i (02.08).** Yığına giren bir araç STACK'te yazmıyorsa iki şey birden olur:
// (a) sonraki okuyan onu bir karar değil bir kaza sanır, (b) aynı işi yapan ikinci bir araç eklenir
// ve kimse çakışmayı fark etmez. Denetimin ilk turunda çıkan dört bulgunun dördü de tam buydu —
// kullanılan ama hiçbir yerde beyan edilmemiş araçlar.
//
// **Yalnız `dependencies`, `devDependencies` DEĞİL** (denetimce onaylanan daraltma): mimari beyan
// üretimde ÇALIŞAN şeyi kapsar. Lint eklentisi, tip paketi, test koşucusu mimari bir karar değil
// araç seçimidir ve her birini STACK'e yazmak dosyayı bir `package.json` kopyasına çevirirdi.
//
// Eşleşme ailesiyle: `@dnd-kit/core` için STACK'te `@dnd-kit` yazması yeter — sürüm ve alt paket
// ayrıntısı `package.json`'ın işi, dokümanın işi aracın kendisi.
/** `apps/*` ve `packages/*` altındaki workspace manifestleri. */
function walkPackageJsons() {
  const out = [];
  for (const root of ['apps', 'packages']) {
    for (const e of readdirSync(join(ROOT, root), { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const file = `${root}/${e.name}/package.json`;
      if (existsSync(join(ROOT, file))) out.push(file);
    }
  }
  return out;
}

const DEP_EXEMPT = new Map([
  // Çerçevenin KENDİSİ zaten beyan edilmiş; bunlar onun taşıyıcıları, ayrı bir karar değil.
  ['react', 'Next.js satırı kapsıyor'],
  ['react-dom', 'Next.js satırı kapsıyor'],
  ['server-only', 'Next işaretleyicisi — sunucu modülünü istemciye sızdırmayı derlemede engeller'],
]);

const declaredIn = [read('docs/architecture/STACK.md'), read('docs/architecture/ARCHITECTURE_DECISIONS.md')]
  .join('\n')
  .toLowerCase();

for (const pkgFile of ['package.json', ...walkPackageJsons()]) {
  let pkg;
  try {
    pkg = JSON.parse(read(pkgFile));
  } catch {
    continue;
  }
  for (const dep of Object.keys(pkg.dependencies ?? {})) {
    if (dep.startsWith('@lezzet/') || DEP_EXEMPT.has(dep)) continue;
    // Aile: `@aws-sdk/client-s3` → `@aws-sdk` ve `aws-sdk`; `stripe` → `stripe`.
    const family = dep.startsWith('@') ? dep.split('/')[0] : dep;
    const tokens = [dep, family, family.replace(/^@/, '')];
    if (!tokens.some((t) => declaredIn.includes(t.toLowerCase()))) {
      note(`${pkgFile}: "${dep}" çalışma-anı bağımlılığı STACK.md/ADR'de beyan EDİLMEMİŞ`);
    }
  }
}

// ── 3e. Kardeş-sayfa importu YALNIZ `*-url` olabilir ─────────────────────────
//
// **Denetim bulgusu D1 (03.08).** `STACK §7` bir istisna yazıyor: sayfa-yerel dosyalar kardeş
// sayfadan import EDİLMEZ, tek kapı `*-url.ts` (saf, React'siz, dışarıya yalnız `<sayfa>Link`).
// İstisna daraltılarak yazıldı — fiilî durumu aklamak yerine bir kapı tanımlandı.
//
// **Kural neden script'e indi:** `typecheck` bu bağın İMZA kaymasını yakalar (`ordersLink` bir
// alan kaybederse çağıran derlenmez) ama KAPSAM kaymasını yakalamaz — yarın bir ajan
// `../orders/orders-types`'ı import ederse derleyici sessiz kalır ve yazılı kural fiilen ölür.
// Denetimin cümlesi: *"yazılı kural denetlenmezse çürür."*
//
// **Aile içi muaf.** Bir sayfanın KENDİ alt klasörleri (`components/`, `tabs/`, `[id]/`) aynı
// ailedir; oradaki `../` sayfa sınırını değil klasör sınırını geçer. Kural yalnız
// `operations/<sayfa>/…` ile `operations/<başkaSayfa>/…` arasındaki geçişi görür.
const PAGE_ROOTS = ['apps/web/app/(operations)/operations', 'apps/web/app/(customer)/[locale]'];

/**
 * DEVRALINAN ihlaller — kural indiğinde zaten var olanlar.
 *
 * Liste KAPALI ve KENDİ KENDİNİ TEMİZLER: bir satır artık ihlal etmiyorsa denetim "liste bayat"
 * diye HATA verir. Muafiyet listeleri tam da bu yüzden çürür — kural indiği gün dürüst, altı ay
 * sonra kimsenin bakmadığı bir aklama olur. Bu liste büyüyemez de: yeni bir ihlal listede
 * olmadığı için doğrudan düşer.
 *
 * **BUGÜN BOŞ ve mekanizma bir kez işledi (03.08):** kural indiğinde dört ihlal vardı, dördü de
 * müşteri şeridinde ve `login` sayfasının action/ikonlarını paylaşıyordu. Paylaşılan parçalar
 * sahiplerine taşındı (`lib/auth/otp-actions.ts` · `components/customer/auth/provider-icons.tsx`)
 * ve satırlar listeden düştü. Boş kalması listenin işe yaramadığı anlamına gelmiyor — tersine,
 * çürümeden kapanan bir muafiyet listesi tam olarak böyle görünür.
 */
const SIBLING_IMPORT_GRANDFATHER = new Set([]);
const grandfatherSeen = new Set();

/** Bir dizini özyineli gezip `.ts`/`.tsx` dosyalarını verir. */
function walkSource(dir) {
  const out = [];
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const path = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...walkSource(path));
    else if (/\.tsx?$/.test(e.name)) out.push(path);
  }
  return out;
}

for (const pageRoot of PAGE_ROOTS.filter((p) => existsSync(join(ROOT, p)))) {
  for (const file of walkSource(pageRoot)) {
    // Dosyanın hangi SAYFAYA ait olduğu: kökten sonraki ilk klasör.
    const ownPage = file.slice(pageRoot.length + 1).split('/')[0];
    for (const m of read(file).matchAll(/from\s+'(\.\.\/[^']+)'/g)) {
      const spec = m[1];
      // Hedefi çöz: dosyanın klasöründen göreli yolu normalize et.
      const resolved = join(dirname(file), spec).replace(/\\/g, '/');
      if (!resolved.startsWith(`${pageRoot}/`)) continue; // sayfa köklerinin dışına çıkan import (lib, components) serbest
      const targetPage = resolved.slice(pageRoot.length + 1).split('/')[0];
      if (targetPage === ownPage) continue; // aile içi
      if (/-url$/.test(resolved)) continue; // yazılı istisna (STACK §7)

      const id = `${file} → ${spec}`;
      if (SIBLING_IMPORT_GRANDFATHER.has(id)) {
        grandfatherSeen.add(id);
        continue;
      }
      note(`${file}: kardeş sayfadan import — '${spec}'. STACK §7: kardeş sayfadan YALNIZ '*-url' import edilebilir`);
    }
  }
}

// Devralınan liste kendini temizler: düzelen satır listede kalırsa bir sonraki ihlali aklardı.
for (const id of SIBLING_IMPORT_GRANDFATHER) {
  if (!grandfatherSeen.has(id)) note(`docs-check 3e: devralınan muafiyet BAYAT — "${id}" artık ihlal etmiyor, satırı listeden sil`);
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
