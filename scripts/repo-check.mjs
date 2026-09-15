#!/usr/bin/env node
// Repo tutarlılık denetimi: kodun kendi içindeki ve kalan referans dokümanlarla tutarlılığı.
// Kullanım: `pnpm repo:check` (hatada 1 döner) · `pnpm docs:sync` (veri modeli alan tablolarını
// migration'dan yeniden üretir; başka hiçbir metni değiştirmez). Commit kancası bu betiği commit'e
// giren içerik üzerinde koşar (.githooks/pre-commit); yalnız node yerleşikleri kullanılır.
// Bölüm harfleri sabittir (§3j): kaldırılan bölümün harfi yeniden verilmez, yeni kural sona eklenir.

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
// Yalnız üç katmanda da karşılığı olan varlıklar denetlenir: kodlanmamış varlık hata değil.
const ENTITIES = [
  { doc: 'Category (kategori)', part: 'katalog', table: 'category', schema: 'category.schema.ts', zod: 'CategorySchema' },
  { doc: 'Collection (koleksiyon)', part: 'katalog', table: 'collection', schema: 'collection.schema.ts', zod: 'CollectionSchema' },
  { doc: 'Product (ürün)', part: 'katalog', table: 'product', schema: 'product.schema.ts', zod: 'ProductSchema' },
  { doc: 'ProductVariant (ürün varyantı)', part: 'katalog', table: 'product_variant', schema: 'product-variant.schema.ts', zod: 'ProductVariantSchema' },
  { doc: 'Price (fiyat)', part: 'katalog', table: 'price', schema: 'price.schema.ts', zod: 'PriceSchema' },
  { doc: 'Discount (indirim / kupon)', part: 'katalog', table: 'discount', schema: 'discount.schema.ts', zod: 'DiscountSchema' },
  { doc: 'DiscountCode (kupon kodu)', part: 'katalog', table: 'discount_code', schema: 'discount.schema.ts', zod: 'DiscountCodeSchema' },
  { doc: 'Stock (stok partisi)', part: 'stok-tedarik', table: 'stock', schema: 'stock.schema.ts', zod: 'StockSchema' },
  { doc: 'Reservation (rezervasyon)', part: 'stok-tedarik', table: 'reservation', schema: 'stock.schema.ts', zod: 'ReservationSchema' },
  { doc: 'StockMovement (stok hareket defteri)', part: 'stok-tedarik', table: 'stock_movement', schema: 'stock-movement.schema.ts', zod: 'StockMovementSchema' },
  { doc: 'TemperatureLog (sıcaklık kaydı)', part: 'stok-tedarik', table: 'temperature_log', schema: 'temperature-log.schema.ts', zod: 'TemperatureLogSchema' },
  { doc: 'Supplier (tedarikçi)', part: 'stok-tedarik', table: 'supplier', schema: 'supply.schema.ts', zod: 'SupplierSchema' },
  { doc: 'SupplierProduct (ürün–tedarikçi eşlemesi)', part: 'stok-tedarik', table: 'supplier_product', schema: 'supply.schema.ts', zod: 'SupplierProductSchema' },
  { doc: 'PurchaseOrder (tedarik siparişi)', part: 'stok-tedarik', table: 'purchase_order', schema: 'supply.schema.ts', zod: 'PurchaseOrderSchema' },
  { doc: 'PurchaseOrderItem (tedarik siparişi kalemi)', part: 'stok-tedarik', table: 'purchase_order_item', schema: 'supply.schema.ts', zod: 'PurchaseOrderItemSchema' },
  { doc: 'StockIntake (stok girişi / satın alma)', part: 'stok-tedarik', table: 'stock_intake', schema: 'supply.schema.ts', zod: 'StockIntakeSchema' },
  { doc: 'Address (adres)', part: 'musteri-siparis', table: 'address', schema: 'address.schema.ts', zod: 'AddressSchema' },
  { doc: 'DeliveryZone (rota / teslimat bölgesi)', part: 'musteri-siparis', table: 'delivery_zone', schema: 'delivery-zone.schema.ts', zod: 'DeliveryZoneSchema' },
  { doc: 'Order (sipariş)', part: 'musteri-siparis', table: 'order', schema: 'order.schema.ts', zod: 'OrderSchema' },
  { doc: 'OrderItem (sipariş kalemi)', part: 'musteri-siparis', table: 'order_item', schema: 'order.schema.ts', zod: 'OrderItemSchema' },
  { doc: 'OrderItemBatch (kalem–parti eşlemesi)', part: 'musteri-siparis', table: 'order_item_batch', schema: 'order.schema.ts', zod: 'OrderItemBatchSchema' },
  { doc: 'OrderStatusLog (durum geçiş kaydı)', part: 'musteri-siparis', table: 'order_status_log', schema: 'order.schema.ts', zod: 'OrderStatusLogSchema' },
  { doc: 'Cart (sunucu sepeti)', part: 'musteri-siparis', table: 'cart', schema: 'cart.schema.ts', zod: 'CartSchema' },
  { doc: 'CartLink (sepet bağlantısı)', part: 'musteri-siparis', table: 'cart_link', schema: 'cart-link.schema.ts', zod: 'CartLinkSchema' },
  { doc: 'Conversation (konuşma) — sosyal mesajlaşma (WhatsApp · Messenger · Instagram)', part: 'iletisim-geribildirim', table: 'conversation', schema: 'conversation.schema.ts', zod: 'ConversationSchema' },
  { doc: 'Message (mesaj)', part: 'iletisim-geribildirim', table: 'message', schema: 'conversation.schema.ts', zod: 'MessageSchema' },
  { doc: 'ConversationNote (sohbetin iç notu)', part: 'iletisim-geribildirim', table: 'conversation_note', schema: 'conversation.schema.ts', zod: 'ConversationNoteSchema' },
  { doc: 'AiUsage (AI kullanım defteri)', part: 'asistan', table: 'ai_usage', schema: 'ai-usage.schema.ts', zod: 'AiUsageEntrySchema' },
  { doc: 'Setting (işletme ayarı)', part: 'iletisim-geribildirim', table: 'settings', schema: 'setting.schema.ts', zod: 'SettingSchema' },
  // Kodlanmamış varlıkta `cols` boş olur ve karşılaştırma atlanır; tablo doğunca kontrol kendiliğinden başlar.
  { doc: 'JobRun (zamanlanmış iş izi)', part: 'operasyon', table: 'job_run', schema: 'job-run.schema.ts', zod: 'JobRunSchema' },
  { doc: 'ErrorLog (hata kaydı)', part: 'operasyon', table: 'error_log', schema: 'error-log.schema.ts', zod: 'ErrorLogSchema' },
  { doc: 'SystemHealthSnapshot (sistem sağlığı anlık görüntüsü)', part: 'operasyon', table: 'system_health_snapshot', schema: 'system-health.schema.ts', zod: 'SystemHealthSnapshotSchema' },
];

/**
 * Veri modeli parçasındaki `## Başlık` altındaki İLK markdown tablosunun alan adları. Yalnız ilki:
 * bölüm alan tablosundan sonra başka tablo da taşıyabilir. Saklanmayan alanlar (`(türetilir)` tipi
 * ya da notta "saklanmaz") atlanır.
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

/** Migration'daki `create table public.X (...)` gövdesinden kolon adları; çok satırlı kısıtlar parantez derinliğiyle atlanır. */
function tableColumns(sql, table) {
  const m = sql.match(new RegExp(`create table public\\.${table} \\(([\\s\\S]*?)\\n\\);`));
  if (!m) return null;
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

/** `.object({ … })` gövdesi, parantez dengelenerek. */
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

/** Gövdedeki en üst seviye alan adları (girinti derinliğine göre). */
function topLevelKeys(body) {
  const rows = [...body.matchAll(/^([ \t]*)([a-zA-Z][a-zA-Z0-9]*)\s*:/gm)].map((m) => ({ indent: m[1].length, key: m[2] }));
  if (rows.length === 0) return [];
  const min = Math.min(...rows.map((r) => r.indent));
  return rows.filter((r) => r.indent === min).map((r) => r.key);
}

/** Zod şemasındaki alan adları; `.merge(OtherSchema)` zinciri izlenir (şema başka dosyada olabilir). */
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

/** Tüm şema dosyaları (primitives / entities / contracts) tek metin — merge her yöne olabilir. */
function allSchemaSrc() {
  const dirs = ['packages/types/src/primitives', 'packages/types/src/entities', 'packages/types/src/contracts'];
  return dirs
    .flatMap((dir) =>
      readdirSync(join(ROOT, dir))
        .filter((f) => f.endsWith('.ts'))
        .map((f) => read(`${dir}/${f}`)),
    )
    .join('\n');
}

const migrationFiles = readdirSync(join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql'));

// ── 0. Migration sürüm numarası TEKİL olmalı ─────────────────────────────────
// Aynı numarayı iki dosya paylaşırsa Supabase ikincisini sessizce atlar; paralel çalışmada çakışma kaçınılmazdır.
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

// ── 1d. Veri modeli ALAN LİSTESİ TÜRETİLİR (02.18 · kullanıcı kararı 26.08) ──
// Kolon listesi migration'lardan üretilir (`<!-- alanlar:tablo -->` … `<!-- /alanlar -->`, `pnpm docs:sync`);
// markdown üçüncü nüsha olarak çürüyordu. Liste makinenin, karar insanın.
const KOLON_YOK = /^(constraint|primary key|unique|check|foreign key|exclude|like)\b/i;

/** `(` … `)` dengeli okunur. */
function parenGovde(sql, acilisIdx) {
  let i = acilisIdx + 1;
  for (let d = 1; d > 0 && i < sql.length; i += 1) {
    if (sql[i] === '(') d += 1;
    else if (sql[i] === ')') d -= 1;
  }
  return sql.slice(acilisIdx + 1, i - 1);
}

/** Virgülle böler; parantez ve tırnak içindeki virgülü bölmez (`default ','` gibi). */
function ustDuzeyParcala(govde) {
  const out = [];
  let d = 0;
  let bas = 0;
  let tirnak = false;
  for (let i = 0; i < govde.length; i += 1) {
    const c = govde[i];
    if (c === "'") tirnak = !tirnak;
    else if (tirnak) continue;
    else if (c === '(') d += 1;
    else if (c === ')') d -= 1;
    else if (c === ',' && d === 0) {
      out.push(govde.slice(bas, i));
      bas = i + 1;
    }
  }
  out.push(govde.slice(bas));
  return out.map((x) => x.trim()).filter(Boolean);
}

function kolonAyristir(parca) {
  if (KOLON_YOK.test(parca)) return null;
  const m = parca.match(/^([a-z_][a-z0-9_]*)\s+([\s\S]+)$/i);
  if (!m) return null;
  const kalan = m[2].replace(/\s+/g, ' ').trim();
  const tipM = kalan.match(/^([a-z_][a-z0-9_ ]*(?:\([^)]*\))?(?:\[\])?)/i);
  const tip = (tipM ? tipM[1] : kalan)
    .replace(/\s+(not null|null|default|references|generated|check|primary|unique|collate)\b[\s\S]*$/i, '')
    .trim();
  const varM = kalan.match(/\bdefault\s+((?:[^ ]|\([^)]*\))+)/i);
  return {
    ad: m[1],
    tip,
    nullable: !/\bnot null\b/i.test(kalan) && !/\bprimary key\b/i.test(kalan),
    varsayilan: varM ? varM[1].replace(/[,;]$/, '') : null,
    uretilmis: /\bgenerated always as\b/i.test(kalan),
  };
}

/** Migration'lardan tablo → kolon listesi. Yorumlar (blok dahil) önce atılır; atlanırsa kolonlar sessizce eksik kalır. */
function migrationKolonlari() {
  const tablolar = new Map();
  for (const f of migrationFiles) {
    const sql = read(`supabase/migrations/${f}`)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/--[^\n]*/g, '');
    for (const m of sql.matchAll(/create table (?:if not exists )?public\.([a-z_]+)\s*\(/g)) {
      tablolar.set(m[1], ustDuzeyParcala(parenGovde(sql, m.index + m[0].length - 1)).map(kolonAyristir).filter(Boolean));
    }
    for (const m of sql.matchAll(/alter table (?:only )?public\.([a-z_]+)([\s\S]*?);/g)) {
      const mevcut = tablolar.get(m[1]);
      if (!mevcut) continue;
      for (const a of m[2].matchAll(/add column (?:if not exists )?([\s\S]*?)(?=,\s*add |,\s*$|$)/g)) {
        const k = kolonAyristir(a[1].trim().replace(/,$/, ''));
        if (k && !mevcut.some((x) => x.ad === k.ad)) mevcut.push(k);
      }
    }
  }
  return tablolar;
}

const KOLON_BASLIK = '| Kolon | Tip | Null | Varsayılan |\n| --- | --- | --- | --- |';

function alanBloguUret(kolonlar) {
  const satirlar = kolonlar.map((k) => {
    const v = k.uretilmis ? '*üretilmiş*' : k.varsayilan ? `\`${k.varsayilan}\`` : '';
    return `| \`${k.ad}\` | ${k.tip} | ${k.nullable ? '•' : ''} | ${v} |`;
  });
  return `${KOLON_BASLIK}\n${satirlar.join('\n')}`;
}

const dmKolonlar = migrationKolonlari();
const dmDosyalar = readdirSync(join(ROOT, 'docs/architecture/data-model')).filter((f) => f.endsWith('.md'));
for (const f of dmDosyalar) {
  const yol = `docs/architecture/data-model/${f}`;
  const md = read(yol);
  let yeniMd = md;
  // Desen boş bloğu da tutar (`\n?`); gövdede ikinci açılış görülürse blok bozuktur ve yazılmaz.
  for (const m of md.matchAll(/<!-- alanlar:([a-z_]+) -->\n?([\s\S]*?)\n?<!-- \/alanlar -->/g)) {
    if (m[2].includes('<!-- alanlar:')) {
      note(`${yol}: \`${m[1]}\` bloğu KAPANMAMIŞ — gövdesinde ikinci bir açılış işareti var; üretim durduruldu`);
      continue;
    }
    const kolonlar = dmKolonlar.get(m[1]);
    if (!kolonlar) {
      note(`${yol}: \`<!-- alanlar:${m[1]} -->\` — böyle bir tablo migration'larda YOK`);
      continue;
    }
    const beklenen = alanBloguUret(kolonlar);
    if (m[2] === beklenen) continue;
    if (FIX) yeniMd = yeniMd.replace(m[0], `<!-- alanlar:${m[1]} -->\n${beklenen}\n<!-- /alanlar -->`);
    else note(`${yol}: \`${m[1]}\` alan listesi bayat — \`pnpm docs:sync\` çalıştır (blok TÜRETİLİR, elle yazılmaz)`);
  }
  if (FIX && yeniMd !== md) {
    writeFileSync(join(ROOT, yol), yeniMd);
    console.log(`✔ ${yol} alan listeleri güncellendi`);
  }

  // Karar satırı var olmayan bir alanı anlatamaz (doküman eksik olabilir, yanlış olamaz).
  for (const bolum of md.split(/\n## /).slice(1)) {
    const tabloM = bolum.match(/<!-- alanlar:([a-z_]+) -->/);
    if (!tabloM) continue;
    const kolonlar = new Set((dmKolonlar.get(tabloM[1]) ?? []).map((k) => k.ad));
    const kararlar = bolum.split('<!-- /alanlar -->')[1] ?? '';
    for (const k of kararlar.matchAll(/^- \*\*`([a-z_]+)`/gm)) {
      if (!kolonlar.has(k[1])) {
        note(`${yol} (${tabloM[1]}): karar satırı \`${k[1]}\` alanını anlatıyor ama tabloda böyle bir kolon YOK`);
      }
    }
  }
}

// ── 1a. Para: `…Cents` şema alanı ↔ euro kolonu, BEYANLA bağlanır (02.9 · STACK §8) ──
// DB euro `numeric`, uygulama tamsayı cent; bağı `BaseDbService.moneyFields` kurar. Beyansız `…Cents`
// alanı adı doğru ama dönüşümü olmayan alandır. Beyan paylaşılan `…MONEY_FIELDS` sabitinde de olabilir.
const serviceDir = 'packages/database/src/services';
const serviceSrc = readdirSync(join(ROOT, serviceDir))
  .filter((f) => f.endsWith('.ts'))
  .map((f) => read(`${serviceDir}/${f}`))
  .join('\n');
const declaredCents = new Set();
for (const decl of serviceSrc.matchAll(/\b(?:moneyFields|[A-Z_]*MONEY_FIELDS)\s*(?::[^=]*)?=\s*\[([^\]]*)\]/g)) {
  for (const field of decl[1].matchAll(/['"]([A-Za-z0-9_]+)['"]/g)) declaredCents.add(field[1]);
}
for (const field of declaredCents) {
  if (!field.endsWith('Cents')) note(`moneyFields beyanı "${field}": para alanı adı Cents ile bitmeli (STACK §8)`);
}
// `…Cents` alanı `dbNumeric` olamaz: dönüşümü taban sınıf yapar, şema tamsayı bekler.
for (const m of allSchemaSrc().matchAll(/([A-Za-z0-9_]*Cents)\s*:\s*dbNumeric/g)) {
  note(`${m[1]}: "…Cents" alanı dbNumeric kullanamaz — dönüşüm moneyFields ile taban sınıfta yapılır (STACK §8)`);
}

/** Şema alanının DB kolonu: beyan edilmiş para alanında `Cents` eki düşer. */
const columnOf = (field) => snake(declaredCents.has(field) ? field.slice(0, -'Cents'.length) : field);

for (const e of ENTITIES) {
  const partMd = parts.get(e.part) ?? '';
  // Türetilmiş alan bloğuna geçen varlıkta doküman tablosu yoktur; yalnız Zod ↔ tablo karşılaştırılır.
  const tureyen = partMd.includes(`<!-- alanlar:${e.table} -->`);
  const doc = tureyen ? null : docFields(partMd, e.doc);
  const cols = tableColumns(migrations, e.table);
  const zod = zodFields(allSchemaSrc(), e.zod);
  if (!tureyen && !doc) { note(`data-model/${e.part}.md: "## ${e.doc}" başlığı ya da tablosu bulunamadı`); continue; }
  if (!cols || !zod) continue; // henüz kodlanmamış varlık — artımlı inşa, hata değil

  for (const field of zod) {
    if (!field.endsWith('Cents') || declaredCents.has(field)) continue;
    if (cols.includes(snake(field.slice(0, -'Cents'.length)))) {
      note(`${e.zod}.${field}: para alanı ${e.table} servisinin moneyFields beyanında YOK → euro/cent dönüşümü yapılmıyor (STACK §8)`);
    }
  }

  const docSnake = (doc ?? []).map(snake);
  const zodSnake = zod.map(columnOf);
  const missInDb = doc ? docSnake.filter((f) => !cols.includes(f)) : [];
  const extraInDb = doc ? cols.filter((c) => !docSnake.includes(c)) : [];
  const zodVsDb = zodSnake.filter((f) => !cols.includes(f));
  const dbVsZod = cols.filter((c) => !zodSnake.includes(c));

  if (missInDb.length) note(`[bilgi] ${e.table}: DATA_MODEL'de var, migration'da yok → ${missInDb.join(', ')}`);
  if (extraInDb.length) note(`${e.table}: migration'da var, DATA_MODEL'de YOK → ${extraInDb.join(', ')} — kod haklıdır, dokümanı güncelle`);
  if (zodVsDb.length) note(`${e.zod}: şemada var, tabloda yok → ${zodVsDb.join(', ')}`);
  if (dbVsZod.length) note(`${e.zod}: tabloda var, şemada yok → ${dbVsZod.join(', ')}`);
}

// ── 1b. Junction/ara tablolar: metin satırında geçen kolonlar ─────────────────
// Markdown tablosu olmayan tablolar tek satırda anlatılır; kolon adı metinde `backtick` içinde geçmeli.
const JUNCTIONS = [{ part: 'katalog', table: 'product_collections' }];
for (const j of JUNCTIONS) {
  const cols = tableColumns(migrations, j.table);
  const md = parts.get(j.part) ?? '';
  const mentions = md.split('\n').filter((l) => l.includes(`\`${j.table}\``)).join(' ');
  if (!cols || !mentions) continue;
  const missing = cols.filter((c) => !mentions.includes(`\`${c}\``));
  if (missing.length) note(`${j.table}: tabloda var, data-model/${j.part}.md anlatımında yok → ${missing.join(', ')} — kod haklıdır, dokümanı güncelle`);
}

// ── 1c. Enum listesi ↔ migration'lar ─────────────────────────────────────────
// Adlar VE değerler (sırasıyla) karşılaştırılır: enum gövdesi `--` yorumları atılıp parantez dengeli okunur,
// yoksa yorumunda parantez taşıyan enum'da liste sessizce kesilir.
const enumBodies = (() => {
  const clean = migrations.replace(/--[^\n]*/g, '');
  const out = new Map();
  for (const m of clean.matchAll(/create type (?:public\.)?([a-z_]+) as enum\s*\(/g)) {
    let i = m.index + m[0].length;
    const start = i;
    for (let depth = 1; depth > 0; i += 1) {
      if (clean[i] === '(') depth += 1;
      else if (clean[i] === ')') depth -= 1;
    }
    out.set(m[1], [...clean.slice(start, i - 1).matchAll(/'([^']+)'/g)].map((v) => v[1]));
  }
  return out;
})();
const dbEnums = new Set(enumBodies.keys());
const enumSection = (() => {
  const md = read('docs/architecture/DATA_MODEL.md');
  const start = md.indexOf("## Enum'lar");
  if (start === -1) return null;
  const end = md.indexOf('\n## ', start + 1);
  return md.slice(start, end === -1 ? undefined : end);
})();
if (enumSection === null) {
  note("DATA_MODEL.md: \"## Enum'lar\" bölümü bulunamadı — denetim körleşti");
} else {
  const listed = new Set([...enumSection.matchAll(/^- `([a-z_]+)`:/gm)].map((m) => m[1]));
  const eksik = [...dbEnums].filter((e) => !listed.has(e)).sort();
  const hayalet = [...listed].filter((e) => !dbEnums.has(e)).sort();
  if (eksik.length) note(`DATA_MODEL Enum'lar: veritabanında var, listede yok → ${eksik.join(', ')}`);
  if (hayalet.length) note(`DATA_MODEL Enum'lar: listede var, veritabanında YOK → ${hayalet.join(', ')} — yeniden adlandırılmış ya da silinmiş olabilir`);

  // Satır biçimi: `- \`ad\`: v1, v2 *(isteğe bağlı şerh)*`
  for (const m of enumSection.matchAll(/^- `([a-z_]+)`: ([^\n]*?)(?: \*\(.*\)\*)?$/gm)) {
    const dbValues = enumBodies.get(m[1]);
    if (!dbValues) continue;
    const listed = m[2].split(',').map((v) => v.trim()).filter(Boolean);
    if (listed.join('|') !== dbValues.join('|')) {
      note(`DATA_MODEL Enum'lar \`${m[1]}\`: değerler ayrışmış → listede "${listed.join(', ')}", veritabanında "${dbValues.join(', ')}"`);
    }
  }
}

// ── 2. Dokümanlarda anılan yollar gerçekte var mı ──────────────────────────────
// Yalnız paket kökleri sıkı denetlenir; planlanan dosyalar anılabilir.
const docFiles = [...readdirSync(join(ROOT, 'docs/architecture')).map((f) => `docs/architecture/${f}`), 'CLAUDE.md'].filter((f) =>
  f.endsWith('.md'),
);

const referencedPackages = new Set();
for (const f of docFiles) {
  for (const m of read(f).matchAll(/`(packages\/[a-z-]+)`/g)) referencedPackages.add(m[1]);
}
for (const pkg of [...referencedPackages].sort()) {
  if (!existsSync(join(ROOT, pkg))) note(`${pkg} dokümanlarda anılıyor ama repoda yok`);
}

// ── 3b. BEKLEYEN(...) işaretleri geçerli bir kayda mı bağlı ───────────────────
// İşaret envanter değil, `docs/KALAN.md`'deki satıra doğrulanmış bağdır; düz `TODO` bu yüzden yasak.
// Biçim: `BEKLEYEN(08.5): …` · `BEKLEYEN(K.3): …` · `BEKLEYEN(BACKLOG §1): …`; birden çok kimlik `/` ile.
const codeRoots = ['apps', 'packages', 'scripts'];
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

const KALAN_YOL = 'docs/KALAN.md';
const kalan = existsSync(join(ROOT, KALAN_YOL)) ? read(KALAN_YOL) : '';
if (!kalan) note(`${KALAN_YOL} yok — BEKLEYEN işaretleri doğrulanamıyor`);
const kalanIds = new Set([...kalan.matchAll(/^- \[[ x~]\] \(([A-Z0-9]+\.\d+)\)/gm)].map((m) => m[1]));
const closedIds = new Set([...kalan.matchAll(/^- \[x\] \(([A-Z0-9]+\.\d+)\)/gm)].map((m) => m[1]));
const backlogSections = new Set([...kalan.matchAll(/^### BACKLOG §(\d+)/gm)].map((m) => m[1]));

let pendingCount = 0;
for (const root of codeRoots) {
  if (!existsSync(join(ROOT, root))) continue;
  for (const file of walk(root)) {
    if (file.endsWith('scripts/repo-check.mjs')) continue; // buradaki geçişler kuralın örneği, borç değil
    for (const m of read(file).matchAll(/BEKLEYEN\(([^)]*)\)\s*:\s*(.*)/g)) {
      pendingCount += 1;
      const what = m[2].trim();
      if (!what) note(`${file}: BEKLEYEN(${m[1].trim()}) neyi beklediğini yazmıyor`);
      for (const ref of m[1].split('/').map((r) => r.trim())) {
        const taskRef = ref.match(/^([A-Z0-9]+\.\d+)$/);
        const backlogRef = ref.match(/^BACKLOG §(\d+)$/);
        if (taskRef) {
          if (!kalanIds.has(taskRef[1])) note(`${file}: BEKLEYEN(${ref}) — ${KALAN_YOL}'de böyle bir kimlik yok`);
          else if (closedIds.has(taskRef[1])) note(`[bilgi] ${file}: BEKLEYEN(${ref}) — satır kapanmış ([x]); işaret sökülmeli ya da açık satıra taşınmalı`);
        } else if (backlogRef) {
          if (!backlogSections.has(backlogRef[1])) note(`${file}: BEKLEYEN(${ref}) — ${KALAN_YOL}'de "BACKLOG §${backlogRef[1]}" bölümü yok`);
        } else {
          note(`${file}: BEKLEYEN(${ref}) — referans "NN.k", "K.n" ya da "BACKLOG §N" olmalı`);
        }
      }
    }
  }
}
if (pendingCount) console.log(`· ${pendingCount} BEKLEYEN işareti (hepsi bir kayda bağlı)`);

// ── 3c2. Her migration dosyasının index.md'de bir satırı var mı ───────────────
// Satırlar elle yazılan bağlam taşır (türetilemez); varlığı denetlenir.
const migrationDir = 'supabase/migrations';
const migrationIndexPath = `${migrationDir}/index.md`;
if (existsSync(join(ROOT, migrationIndexPath))) {
  const indexSrc = read(migrationIndexPath);
  for (const file of readdirSync(join(ROOT, migrationDir)).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort()) {
    if (!indexSrc.includes(file)) note(`${migrationIndexPath}: ${file} kayıtlı değil — her migration'ın bir satırı olmalı`);
  }
}

// ── 3d. Çalışma-anı bağımlılığı mimari dokümanda BEYAN EDİLMİŞ mi ─────────────
// Yalnız `dependencies` (üretimde çalışan); aile eşleşmesi yeter (`@dnd-kit/core` için `@dnd-kit`).
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
    const family = dep.startsWith('@') ? dep.split('/')[0] : dep;
    const tokens = [dep, family, family.replace(/^@/, '')];
    if (!tokens.some((t) => declaredIn.includes(t.toLowerCase()))) {
      note(`${pkgFile}: "${dep}" çalışma-anı bağımlılığı STACK.md/ADR'de beyan EDİLMEMİŞ`);
    }
  }
}

// ── 3e. Kardeş-sayfa importu YALNIZ `*-url` olabilir ─────────────────────────
// STACK §7: sayfa-yerel dosya kardeş sayfadan yalnız `*-url.ts` alır; `typecheck` kapsam kaymasını görmez.
// Sayfanın kendi alt klasörleri aynı ailedir. Devralınan muafiyet listesi kendini temizler: düzelen satır kalırsa hata.
const PAGE_ROOTS = ['apps/web/app/(operations)/operations', 'apps/web/app/(customer)/[locale]'];
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
    const ownPage = file.slice(pageRoot.length + 1).split('/')[0];
    for (const m of read(file).matchAll(/from\s+'(\.\.\/[^']+)'/g)) {
      const spec = m[1];
      const resolved = join(dirname(file), spec).replace(/\\/g, '/');
      if (!resolved.startsWith(`${pageRoot}/`)) continue; // lib/components serbest
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

for (const id of SIBLING_IMPORT_GRANDFATHER) {
  if (!grandfatherSeen.has(id)) note(`repo-check 3e: devralınan muafiyet BAYAT — "${id}" artık ihlal etmiyor, satırı listeden sil`);
}

// ── 3f. Teardown'da elle `warehouse`/`account` silme YOK ─────────────────────
// Supabase `delete()` hatayı fırlatmaz, döndürür: `restrict` FK'ye takılan silme sessizce yarım kalır.
// Sıra tek yerde (`cleanup.ts`); `purgeTestData` + `mustDelete` kullanılır. Kapsam test dosyaları.
const TEARDOWN_ROOTS = ['apps/web/lib', 'packages/database/src'];
const FORBIDDEN_DELETE = /from\('(warehouse|account)'\)\s*\.delete\(\)/g;

for (const root of TEARDOWN_ROOTS.filter((p) => existsSync(join(ROOT, p)))) {
  for (const file of walkSource(root).filter((f) => f.endsWith('.test.ts'))) {
    for (const m of read(file).matchAll(FORBIDDEN_DELETE)) {
      note(
        `${file}: teardown'da elle '${m[1]}' silme — CLAUDE.md §4b: purgeTestData({ ${m[1] === 'warehouse' ? 'warehouseIds' : 'accountIds'} }) kullan. ` +
          `Supabase delete() hatayı fırlatmaz, döndürür: restrict FK'ye takılan silme sessizce yarım kalır`,
      );
    }
  }
}

// ── 3g. Operasyon ekranı KENDİ zeminini çizmeli ──────────────────────────────
// Kabuğun zemini bej; `PageHeader` kendi zeminini çizmez. `PageHeader` render eden görünüm dosyasının
// kökü `bg-ops-*` taşımalı. Kök = JSX açan ilk `return (` + `<` (parantezli `useMemo` dönüşü kök sayılmasın).
for (const dir of ['apps/web/app/(operations)/operations']) {
  if (!existsSync(join(ROOT, dir))) continue;
  for (const file of walkSource(dir).filter((f) => /\.(desktop|mobile)\.tsx$/.test(f))) {
    const src = read(file);
    if (!src.includes('<PageHeader')) continue;
    const exported = src.indexOf('export function ');
    if (exported === -1) continue;
    const head = src.slice(exported, exported + 4000);
    const ret = head.search(/return \(\s*</);
    if (ret === -1) continue;
    const rootTag = head.slice(ret, ret + 600);
    if (!rootTag.includes('bg-ops-')) {
      note(`${file}: ekranın kökü zemin sınıfı taşımıyor — \`bg-ops-card\` (kabuğun zemini bej, başlık barı onu gösterir)`);
    }
  }
}

// ── 3h. Operasyon yüzeyinde HAM piksel yazı boyu yok ─────────────────────────
// Yazı ölçeği `globals.css`'teki kapalı `--text-ops-*` merdivenidir; ham `text-[15px]` ölçek değişince yerinde kalır.
// Yalnız yazı boyu: `leading-[…]`, `px-[…]` serbest.
{
  const scaleFile = 'apps/web/app/globals.css';
  const steps = [...read(scaleFile).matchAll(/--text-ops-([a-z-]+):/g)].map((m) => m[1]);
  const hits = [];
  for (const dir of ['apps/web/app/(operations)', 'apps/web/components/operation']) {
    if (!existsSync(join(ROOT, dir))) continue;
    for (const file of walkSource(dir)) {
      for (const [, px] of read(file).matchAll(/\btext-\[([0-9.]+)px\]/g)) hits.push(`${file} (${px}px)`);
    }
  }
  if (hits.length > 0) {
    note(
      `operasyon yüzeyinde ${hits.length} ham piksel yazı boyu — merdiven basamağı kullanılmalı ` +
        `(text-ops-{${steps.join('|')}}): ${hits.slice(0, 5).join(', ')}${hits.length > 5 ? ` … +${hits.length - 5}` : ''}`,
    );
  }
}

// ── 3i. DB'siz test entegrasyon kuyruğunda kalmamalı ─────────────────────────
// `apps/web/lib` entegrasyon köküdür; DB'ye vurmayan test `vitest.config.ts`teki `WEB_LIB_DBSIZ` listesine
// girer ki şeritler koşabilsin. İz GEÇİŞLİ aranır (import ettiği modül `serviceDb` açabilir). Ters yönün
// hakemi `pnpm test:unit`tir (env'siz koşu patlar).
{
  const cfg = existsSync(join(ROOT, 'vitest.config.ts')) ? read('vitest.config.ts') : '';
  const blok = cfg.match(/const WEB_LIB_DBSIZ = \[([\s\S]*?)\];/);
  const kok = 'apps/web/lib';
  if (blok && existsSync(join(ROOT, kok))) {
    const listelenen = new Set([...blok[1].matchAll(/'(apps\/[^']+)'/g)].map((m) => m[1]));
    const DB_IZI = /serviceDb|createClient|@lezzet\/database|purgeTestData|mustDelete/;

    const izBellek = new Map();
    const cozumle = (spec, kaynak) => {
      const ham = spec.startsWith('@/') ? `apps/web/${spec.slice(2)}` : join(dirname(kaynak), spec).replace(/\\/g, '/');
      for (const aday of [`${ham}.ts`, `${ham}.tsx`, `${ham}/index.ts`]) {
        if (existsSync(join(ROOT, aday))) return aday;
      }
      return null;
    };
    const dbIziVar = (file, gezilen = new Set()) => {
      if (izBellek.has(file)) return izBellek.get(file);
      if (gezilen.has(file)) return false; // döngüsel import
      gezilen.add(file);
      const src = read(file);
      let sonuc = DB_IZI.test(src);
      if (!sonuc) {
        for (const m of src.matchAll(/from\s+'((?:\.|@\/)[^']+)'/g)) {
          const hedef = cozumle(m[1], file);
          if (hedef && dbIziVar(hedef, gezilen)) {
            sonuc = true;
            break;
          }
        }
      }
      izBellek.set(file, sonuc);
      return sonuc;
    };

    const gorulen = new Set();

    for (const file of walkSource(kok).filter((f) => /\.test\.tsx?$/.test(f))) {
      if (listelenen.has(file)) {
        gorulen.add(file);
      } else if (!dbIziVar(file)) {
        note(
          `${file}: DB'ye vurmuyor ama entegrasyon kuyruğunda — vitest.config.ts'teki WEB_LIB_DBSIZ ` +
            `listesine ekle, yoksa bu testi yazan şerit onu koşamaz (CLAUDE §4b)`,
        );
      }
    }
    for (const yol of listelenen) {
      if (!gorulen.has(yol)) note(`vitest.config.ts: WEB_LIB_DBSIZ satırı BAYAT — '${yol}' artık yok`);
    }
  }
}

// ── 3k. Kapı doğrulaması: WEB ile MOBİL aynı cümleyi kurmalı ─────────────────
// Aynı `geo_precision` değerini iki yüzey okur; cümle ayrışırsa hiçbir şey kırılmaz, iki kişi farklı şey okur.
// Yalnız `confirmed`/`unknown` dışındaki hâller karşılaştırılır.
{
  const WEB = 'apps/web/components/operation/ui/labels.ts';
  const MOBIL = 'apps/mobile-operations/src/screens/courier/messages.json';
  if (existsSync(join(ROOT, WEB)) && existsSync(join(ROOT, MOBIL))) {
    const webBlok = read(WEB).match(/export const DOOR_CHECK_NOTE[^=]*=\s*\{([\s\S]*?)\n\};/);
    if (!webBlok) {
      note(`${WEB}: DOOR_CHECK_NOTE bulunamadı — §3k karşılaştırma yapamıyor (ad değiştiyse kuralı da güncelle)`);
    } else {
      const webCumle = new Map();
      for (const m of webBlok[1].matchAll(/^\s*(unverified|elsewhere):\s*'((?:[^'\\]|\\.)*)',/gm)) {
        webCumle.set(m[1], m[2].replace(/\\'/g, "'"));
      }
      let mobilCumle = {};
      try {
        mobilCumle = JSON.parse(read(MOBIL))?.delivery?.doorCheck ?? {};
      } catch {
        note(`${MOBIL}: okunamadı/çözümlenemedi — §3k karşılaştırma yapamıyor`);
      }
      for (const hal of ['unverified', 'elsewhere']) {
        const w = webCumle.get(hal);
        const m = mobilCumle[hal];
        if (w === undefined || m === undefined) {
          note(`§3k: '${hal}' cümlesi ${w === undefined ? WEB : MOBIL} tarafında YOK — iki yüzeyden biri susuyor`);
        } else if (w !== m) {
          note(`§3k: '${hal}' cümlesi AYRIŞTI — web: "${w}" / mobil: "${m}". İkisi aynı ${'`geo_precision`'}ı okuyor; aynı cümleyi kurmalılar`);
        }
      }
    }
  }
}

// ── 3j. BÖLÜM HARFLERİ SABİTTİR — atıflar sessizce yanlışlanamaz (02.17) ─────
// Bir bölümün harfi başka kurala kayarsa ona yapılmış atıflar hata vermeden yanlış hedefi gösterir.
// Künye sabittir; başlık değişirse ya da harf başka kurala verilirse burası kırmızıya döner.
// 3, 3c ve 4 kaldırıldı (doküman senkronu bitti); harfleri yeniden verilmez.
const BOLUM_KUNYE = {
  '0': 'Migration sürüm numarası TEKİL olmalı',
  '1': 'DATA_MODEL ↔ migration ↔ Zod',
  '1a': 'Para: `…Cents` şema alanı ↔ euro kolonu, BEYANLA bağlanır (02.9 · STACK §8)',
  '1b': 'Junction/ara tablolar: metin satırında geçen kolonlar',
  '1c': "Enum listesi ↔ migration'lar",
  '1d': 'Veri modeli ALAN LİSTESİ TÜRETİLİR (02.18 · kullanıcı kararı 26.08)',
  '2': 'Dokümanlarda anılan yollar gerçekte var mı',
  '3b': 'BEKLEYEN(...) işaretleri geçerli bir kayda mı bağlı',
  '3d': 'Çalışma-anı bağımlılığı mimari dokümanda BEYAN EDİLMİŞ mi',
  '3e': 'Kardeş-sayfa importu YALNIZ `*-url` olabilir',
  '3f': "Teardown'da elle `warehouse`/`account` silme YOK",
  '3g': 'Operasyon ekranı KENDİ zeminini çizmeli',
  '3h': 'Operasyon yüzeyinde HAM piksel yazı boyu yok',
  '3i': "DB'siz test entegrasyon kuyruğunda kalmamalı",
  '3j': 'BÖLÜM HARFLERİ SABİTTİR — atıflar sessizce yanlışlanamaz (02.17)',
  '3k': 'Kapı doğrulaması: WEB ile MOBİL aynı cümleyi kurmalı',
  '3l': 'Ortam değişkeni belgesiz kalmaz',
};

{
  const kendi = read('scripts/repo-check.mjs');
  const gercek = new Map();
  for (const m of kendi.matchAll(/^\/\/ ── ([0-9][a-z]?)\. (.+?) ─+$/gm)) gercek.set(m[1], m[2].trim());

  for (const [harf, baslik] of Object.entries(BOLUM_KUNYE)) {
    const simdi = gercek.get(harf);
    if (!simdi) note(`repo-check §${harf}: künyede yazılı ama böyle bir bölüm YOK — harf silinmiş ya da yeniden adlandırılmış`);
    else if (simdi !== baslik) {
      note(`repo-check §${harf}: ANLAMI DEĞİŞMİŞ — künye "${baslik}" diyor, bölüm "${simdi}". Harf bir kez verilir; yeni kural sona eklenir (02.17)`);
    }
  }
  for (const harf of gercek.keys()) {
    if (!(harf in BOLUM_KUNYE)) note(`repo-check §${harf}: bölüm var ama BOLUM_KUNYE'de yok — yeni kural eklendiyse künyeye de yazılmalı (02.17)`);
  }

  // Atıflar: metinde geçen her `§3x` gerçekten bir bölüme gitmeli (desen dar: 20 karakter içinde).
  for (const f of [...docFiles, 'vitest.config.ts']) {
    if (!existsSync(join(ROOT, f)) || !/\.(md|ts|mjs)$/.test(f)) continue;
    const icerik = read(f);
    if (!/(docs|repo)[:-]check/.test(icerik)) continue;
    for (const m of icerik.matchAll(/(?:docs|repo).?check[^\n]{0,20}?§([0-9][a-z]?)\b/gi)) {
      if (!gercek.has(m[1])) note(`${f}: \`§${m[1]}\` diye bir repo-check bölümü yok — atıf boşa gidiyor (02.17)`);
    }
  }
}

// ── Dosya boyutu: BÖLÜNMESİ GEREKEN dosyalar (uyarı, hata değil) ──────────────
// Büyük dosya her düzenlemede bütünüyle okunur ve bağlamı yakar; kararı ölçüyü gören verir (tablo ya da
// durum makinesi 600 satır olabilir). Ölçü satır sayısıdır.
const SIZE_WARN = 600;
const SIZE_SKIP = /node_modules|\.next|dist|\.test\.|\.spec\./;

function walkSources(dir, out = []) {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (SIZE_SKIP.test(rel)) continue;
    if (entry.isDirectory()) walkSources(rel, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(rel);
  }
  return out;
}

const oversized = ['apps', 'packages', 'scripts']
  .flatMap((root) => (existsSync(join(ROOT, root)) ? walkSources(root) : []))
  .map((rel) => ({ rel, lines: read(rel).split('\n').length }))
  .filter((f) => f.lines > SIZE_WARN)
  .sort((a, z) => z.lines - a.lines);

if (oversized.length) {
  const top = oversized.slice(0, 5).map((f) => `${f.rel} (${f.lines})`);
  note(
    `[bilgi] ${oversized.length} dosya ${SIZE_WARN} satırı aşıyor — dokunulduğunda bölünmeli: ${top.join(' · ')}${oversized.length > 5 ? ' …' : ''}`,
  );
}

// ── 3l. Ortam değişkeni belgesiz kalmaz ──────────────────────────────────────
// Kod `process.env.X` okuyorsa o uygulamanın `.env.example`inde `X=` satırı olmalı; eksik satır hiçbir
// denetimde kırılmaz, yalnız yeni ortam kurulurken görünür. Kapsam `apps/*` (paketi hangi süreç kurar
// bilinemez); testler dışarıda; yorumlar ayıklanır (künyedeki örnek okuma sanılmasın).
const ENV_SKIP = /^(NODE_|npm_|CI$|VITEST|PORT$|NEXT_RUNTIME$|TZ$)/;

function envOku(dir, out = new Set()) {
  for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (/node_modules|\.next|\.turbo|dist/.test(rel)) continue;
    if (entry.isDirectory()) envOku(rel, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$|\.testkit\.ts$/.test(entry.name)) {
      const kod = read(rel)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .replace(/([^:])\/\/.*$/gm, '$1');
      for (const m of kod.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) out.add(m[1]);
    }
  }
  return out;
}

for (const app of readdirSync(join(ROOT, 'apps'), { withFileTypes: true }).filter((e) => e.isDirectory())) {
  const ornekYol = `apps/${app.name}/.env.example`;
  if (!existsSync(join(ROOT, ornekYol))) continue;
  const yazili = new Set([...read(ornekYol).matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]));
  const eksik = [...envOku(`apps/${app.name}`)].filter((v) => !yazili.has(v) && !ENV_SKIP.test(v)).sort();
  if (eksik.length) {
    note(`§3l ${ornekYol}: kodda okunan ${eksik.length} değişken belgesiz — ${eksik.join(', ')}`);
  }
}

// ── Sonuç ─────────────────────────────────────────────────────────────────────
const hard = problems.filter((p) => !p.startsWith('[bilgi]'));
for (const p of problems) console.log((p.startsWith('[bilgi]') ? '· ' : '✗ ') + p);
if (!problems.length) console.log('✔ repo tutarlı');
if (hard.length) {
  console.log(`\n${hard.length} tutarsızlık. Kural: kod haklıdır — dokümanı düzelt; kod disiplini ihlaliyse kodu düzelt.`);
  process.exit(1);
}
