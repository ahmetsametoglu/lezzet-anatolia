// Test veritabanının aynası: ürün künyelerini, katalog künyelerini ve sayılmış stoğu `seed-real/data/`ya BAŞTAN yazar.
// Dosyayla karşılaştırmaz — kazanan veritabanıdır. Her şey bellekte kurulup sınanır, dosyalar ancak hepsi geçerse yazılır.
// Sunucuda: `cd /opt/lezzet/current && runuser -u lezzet -- env HOME=/home/lezzet npx tsx scripts/seed-real-ayna.ts --out=/tmp/ayna`
import { renameSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServiceRoleClient } from '@lezzet/database';
import { katalogAynaAnahtarlari } from './seed/catalog-lezza';
import { ADAY_SKULARI, CATEGORIES, EK_TASLAKLAR, KATALOG_BIRLESIK, PURCHASES } from './seed-real/data';
import type { KatalogKunyesi, KunyeVaryanti, SayimKabulu, UrunKunyesi } from './seed-real/kunye';

try {
  (process as { loadEnvFile?: (path: string) => void }).loadEnvFile?.('.env');
} catch {
  // .env yoksa ortam değişkenleri zaten tanımlı olabilir.
}

const VERI = join(dirname(fileURLToPath(import.meta.url)), 'seed-real/data');
const OUT = process.argv.find((a) => a.startsWith('--out='))?.slice(6) ?? VERI;

/*
  Her kolon ya aynaya girer ya gerekçesiyle dışarıda kalır. Listede olmayan kolon betiği DURDURUR: şemaya yeni bir alan
  eklendiğinde aynaya girip girmeyeceğine biri karar vermeden o alanın verisi sıfırlamada sessizce kaybolurdu.
*/
const KOLONLAR: Record<string, { ayna: string[]; disarida: Record<string, string> }> = {
  product: {
    ayna: ['name', 'description', 'ingredients', 'nutrition', 'storage_instructions', 'preparation_steps', 'allergens', 'traces',
      'date_type', 'shelf_life_days', 'shippable', 'storage_type', 'vat_rate', 'category_id'],
    disarida: {
      id: 'kimlik', slug: 'addan türer', created_at: 'kayıt anı', sort_order: 'kuruluş sırası',
      image_key: 'görsel besleme klasöründen kurulur', image_focal_x: 'görsel', image_focal_y: 'görsel', image_zoom: 'görsel',
      image_alt: 'görsel', image_updated_at: 'görsel', image_width: 'görsel', image_height: 'görsel',
      is_incomplete: 'beyandan türer', status: 'beyan ve fiyattan türer',
      target_margin_percent: 'fiyat kararı', target_margin_b2b_percent: 'fiyat kararı', auto_price: 'fiyat kararı',
      family_id: 'aileler data.ts AILELER', family_label: 'aileler data.ts AILELER', family_position: 'aileler data.ts AILELER',
    },
  },
  product_variant: {
    ayna: ['label', 'net_quantity', 'net_unit', 'pieces_count', 'portion_kind', 'packed_weight_g', 'packed_length_mm',
      'packed_width_mm', 'packed_height_mm', 'sku'],
    disarida: {
      id: 'kimlik', product_id: 'kimlik', created_at: 'kayıt anı', sort_order: 'dizideki sıra',
      min_stock_qty: 'depo eşiği — dolu olan raporlanır', is_active: 'satış açıklığı — kapalı olan raporlanır',
    },
  },
  variant_barcode: {
    ayna: ['code', 'kind', 'qty_per_code'],
    disarida: { id: 'kimlik', variant_id: 'kimlik', created_by: 'personel kimliği sıfırlamada silinir', created_at: 'kayıt anı' },
  },
  stock: {
    ayna: ['variant_id', 'warehouse_id', 'physical_qty', 'expiry_date', 'lot_number', 'purchase_price', 'intake_id', 'storage_area_id'],
    disarida: {
      id: 'kimlik', created_at: 'kayıt anı', initial_qty: 'ayna anlık görüntü, bugünkü miktar yazılır',
      batch_no: 'tetikleyici üretir', purchase_order_item_id: 'sipariş notundan çözülür',
      offer_price: 'parti teklifi — dolu olan raporlanır',
    },
  },
  stock_intake: {
    ayna: ['id', 'warehouse_id', 'date', 'note', 'supplier_id', 'purchase_order_id', 'created_at'],
    disarida: { total_amount: 'kalemlerden türer', received_by: 'personel kimliği sıfırlamada silinir' },
  },
};

type Satir = Record<string, unknown>;
const db = createServiceRoleClient();

/** Tablonun tamamı, sayfa sayfa — tek istek 1000 satırda keser ve kesik okuma aynada sessiz kayıp olurdu. */
async function hepsi(tablo: string, sira: string[] = ['created_at', 'id']): Promise<Satir[]> {
  const satirlar: Satir[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(tablo).select('*');
    for (const k of sira) q = q.order(k, { ascending: true });
    const { data, error } = await q.range(from, from + 999);
    if (error) throw new Error(`${tablo}: ${error.message}`);
    satirlar.push(...(data as Satir[]));
    if (data.length < 1000) break;
  }
  const kural = KOLONLAR[tablo];
  if (kural && satirlar[0]) {
    const bilinmeyen = Object.keys(satirlar[0]).filter((k) => !kural.ayna.includes(k) && !(k in kural.disarida));
    if (bilinmeyen.length > 0) throw new Error(`${tablo}: aynada yeri olmayan kolon — ${bilinmeyen.join(', ')}. KOLONLAR'a ekle ya da gerekçesiyle dışarıda bırak.`);
  }
  return satirlar;
}

const dolu = (v: unknown) => v !== null && v !== undefined;
/** Dil alanı `tr, fr, de` sırasıyla yazılır: `jsonb` anahtarları kendi sırasına dizer ve her koşu dosyada sahte fark doğururdu. */
const DIL_SIRASI = ['tr', 'fr', 'de'];
function diziliDiller(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(diziliDiller);
  if (v === null || typeof v !== 'object') return v;
  const o = v as Record<string, unknown>;
  const anahtarlar = Object.keys(o);
  const dilli = anahtarlar.length > 0 && anahtarlar.every((k) => DIL_SIRASI.includes(k));
  const sira = dilli ? DIL_SIRASI.filter((k) => k in o) : anahtarlar;
  return Object.fromEntries(sira.map((k) => [k, diziliDiller(o[k])]));
}
/** Yalnız dolu alan yazılır: boş alan veritabanında da boştu ve aynada yokluğu bunu söyler. */
const al = <T extends object>(alanlar: Record<string, unknown>) => Object.fromEntries(Object.entries(alanlar).filter(([, v]) => dolu(v))) as T;
const sayi = (v: unknown) => (dolu(v) ? Number(v) : undefined);
const dolusuz = <T>(dizi: T[] | null | undefined) => (dizi && dizi.length > 0 ? dizi : undefined);

async function main(): Promise<void> {
  const [urunler, boylar, barkodlar, kategoriler, partiler, kabuller, depolar, alanlar, tedarikciler, siparisler] = await Promise.all([
    hepsi('product'),
    hepsi('product_variant', ['sort_order', 'created_at', 'id']),
    hepsi('variant_barcode', ['code']),
    hepsi('category'),
    hepsi('stock'),
    hepsi('stock_intake'),
    hepsi('warehouse'),
    hepsi('storage_area'),
    hepsi('supplier'),
    hepsi('purchase_order'),
  ]);
  const sorunlar: string[] = [];
  const rapor: string[] = [];

  const kategoriAnahtari = new Map<string, string>();
  for (const k of kategoriler) {
    const ad = (k.name as { tr?: string }).tr;
    const seed = CATEGORIES.find((c) => c.name.tr === ad);
    if (seed) kategoriAnahtari.set(String(k.id), seed.key);
  }

  const barkodlarByBoy = new Map<string, KunyeVaryanti['barcodes']>();
  for (const b of barkodlar) {
    const liste = barkodlarByBoy.get(String(b.variant_id)) ?? [];
    liste.push({ code: String(b.code), kind: b.kind as 'unit' | 'case', qtyPerCode: Number(b.qty_per_code) });
    barkodlarByBoy.set(String(b.variant_id), liste);
  }
  const boyKunyesi = (v: Satir): KunyeVaryanti =>
    al<KunyeVaryanti>({
      label: v.label,
      netQuantity: sayi(v.net_quantity),
      netUnit: v.net_unit,
      piecesCount: sayi(v.pieces_count),
      portionKind: v.portion_kind,
      packedWeightG: sayi(v.packed_weight_g),
      packedLengthMm: sayi(v.packed_length_mm),
      packedWidthMm: sayi(v.packed_width_mm),
      packedHeightMm: sayi(v.packed_height_mm),
      sku: v.sku,
      barcodes: dolusuz(barkodlarByBoy.get(String(v.id))),
    });
  for (const v of boylar) {
    if (dolu(v.min_stock_qty)) rapor.push(`depo eşiği taşınmadı: ${String(v.sku ?? v.id)} → ${String(v.min_stock_qty)}`);
    if (v.is_active === false) rapor.push(`kapalı boy aynaya girmedi: ${String(v.sku ?? v.id)}`);
  }

  const katalogAnahtari = katalogAynaAnahtarlari(KATALOG_BIRLESIK);
  const beslemeSkulari = new Set([...ADAY_SKULARI, ...PURCHASES.flatMap((p) => p.catalog.map((l) => String(l.sku)))]);
  const taslakAdlari = new Set([...PURCHASES.flatMap((p) => p.drafts), ...EK_TASLAKLAR].map((d) => d.nameTr ?? d.name));
  const urunKunyeleri: Record<string, UrunKunyesi> = {};
  const katalogKunyeleri: Record<string, KatalogKunyesi> = {};
  const boyAdi = new Map<string, { product: string; label: string; sku?: string }>();

  for (const u of urunler) {
    const ad = (u.name as { tr?: string }).tr ?? '';
    const kendi = boylar.filter((v) => v.product_id === u.id);
    for (const v of kendi) boyAdi.set(String(v.id), al({ product: ad, label: (v.label as { tr?: string }).tr ?? '', sku: v.sku }));
    const kategori = dolu(u.category_id) ? kategoriAnahtari.get(String(u.category_id)) : undefined;
    if (dolu(u.category_id) && !kategori) sorunlar.push(`${ad}: kategorisi beslemenin CATEGORIES listesinde yok`);
    const beyan = {
      description: u.description,
      ingredients: u.ingredients,
      nutrition: u.nutrition,
      allergens: u.allergens,
      traces: dolusuz(u.traces as string[] | null),
      storage: u.storage_instructions,
      preparationSteps: dolusuz(u.preparation_steps as unknown[] | null),
      shelfLifeDays: sayi(u.shelf_life_days),
      storageType: u.storage_type,
      shippable: u.shippable,
      dateType: u.date_type,
      vatRate: sayi(u.vat_rate),
      category: kategori,
    };

    // data.ts'teki taslak önce gelir: faturasız taslağa kaynağın SKU'su verilmiş olabilir ve o zaman katalog ürünü sanılırdı.
    if (taslakAdlari.has(ad)) {
      if (urunKunyeleri[ad]) sorunlar.push(`aynı adla iki ürün: ${ad} — künye anahtarı addır`);
      urunKunyeleri[ad] = al<UrunKunyesi>({ name: u.name, ...beyan, variants: kendi.map(boyKunyesi) });
      continue;
    }
    // Katalog ürünü SKU'sundan tanınır; anahtar kuruluştaki çeviri adıdır, paneldeki ad `name` olarak üstüne yazılır.
    const anahtarlar = new Set(kendi.map((v) => (dolu(v.sku) ? katalogAnahtari.get(String(v.sku)) : undefined)));
    if (anahtarlar.size === 1 && !anahtarlar.has(undefined)) {
      const anahtar = [...anahtarlar][0] as string;
      // Pasif katalog ürünü beslemenin seçiminde değilse katalogdan çıkarılmıştır ve aynaya girmez; seçimdeyse kapalı tutulan
      // üründür, pasif kurulsun diye durumu aynaya yazılır.
      const secili = kendi.some((v) => dolu(v.sku) && beslemeSkulari.has(String(v.sku)));
      if (u.status === 'passive' && !secili) {
        rapor.push(`pasif katalog ürünü aynaya girmedi: ${ad}`);
        continue;
      }
      // Kapalı boy kurulmaz (seçimden çıkarılır); aynaya girseydi besleme kurulmamış boyu arardı.
      const acik = kendi.filter((v) => v.is_active !== false);
      if (katalogKunyeleri[anahtar]) sorunlar.push(`katalog anahtarı iki üründe: ${anahtar}`);
      katalogKunyeleri[anahtar] = al<KatalogKunyesi>({
        name: u.name,
        ...(u.status === 'passive' ? { status: 'passive' } : {}),
        ...beyan,
        variants: Object.fromEntries(acik.map((v) => {
          const { sku, ...boy } = boyKunyesi(v);
          return [String(sku), boy];
        })),
      });
      continue;
    }
    if (anahtarlar.size > 1 && [...anahtarlar].some((a) => a !== undefined)) {
      sorunlar.push(`${ad}: boylarının bir kısmı katalogdan, bir kısmı değil — ürün tek kaynaktan kurulur`);
      continue;
    }
    if (urunKunyeleri[ad]) sorunlar.push(`aynı adla iki ürün: ${ad} — künye anahtarı addır`);
    urunKunyeleri[ad] = al<UrunKunyesi>({ name: u.name, ...beyan, variants: kendi.map(boyKunyesi) });
  }

  // Faturadaki taslağın künyesi yoksa besleme durur; ad panelde değiştiyse burada yakalanır, sıfırlamadan sonra değil.
  const kayip = [...taslakAdlari].filter((ad) => !urunKunyeleri[ad]);
  if (kayip.length > 0) sorunlar.push(`data.ts taslağının ürünü veritabanında bu adla yok (ad değişmiş olabilir, nameTr güncellenmeli): ${kayip.join(' · ')}`);

  const depoKodu = new Map(depolar.map((d) => [String(d.id), String(d.code)]));
  const alanAdi = new Map(alanlar.map((a) => [String(a.id), String(a.name)]));
  const tedarikciAdi = new Map(tedarikciler.map((t) => [String(t.id), String(t.name)]));
  const siparisNotu = new Map(siparisler.map((s) => [String(s.id), (s.note as string | null) ?? null]));
  const sayim: SayimKabulu[] = [];
  const kabulById = new Map<string, SayimKabulu>();
  for (const k of kabuller) {
    const siparis = dolu(k.purchase_order_id) ? siparisNotu.get(String(k.purchase_order_id)) ?? null : null;
    if (dolu(k.purchase_order_id) && !siparis) sorunlar.push(`kabul ${String(k.id)}: bağlı siparişin notu yok, beslemede bulunamaz`);
    const kabul: SayimKabulu = {
      warehouse: depoKodu.get(String(k.warehouse_id)) ?? '?',
      date: String(k.date),
      note: (k.note as string | null) ?? null,
      supplier: dolu(k.supplier_id) ? tedarikciAdi.get(String(k.supplier_id)) ?? null : null,
      purchaseOrderNote: siparis,
      lines: [],
    };
    kabulById.set(String(k.id), kabul);
    sayim.push(kabul);
  }
  for (const p of partiler) {
    if (dolu(p.offer_price)) rapor.push(`parti teklifi taşınmadı: ${String(p.lot_number ?? p.id)} → ${String(p.offer_price)} €`);
    if (Number(p.physical_qty) <= 0) continue;
    const kabul = dolu(p.intake_id) ? kabulById.get(String(p.intake_id)) : undefined;
    const boy = boyAdi.get(String(p.variant_id));
    if (!kabul) {
      sorunlar.push(`kabulsüz parti (transferle doğmuş olabilir): ${boy?.product ?? String(p.variant_id)} — bu ayna yalnız kabulden doğan partiyi taşır`);
      continue;
    }
    if (!boy) {
      sorunlar.push(`partinin boyu bulunamadı: ${String(p.variant_id)}`);
      continue;
    }
    kabul.lines.push({
      variant: boy,
      qty: Number(p.physical_qty),
      expiryDate: String(p.expiry_date),
      lotNumber: (p.lot_number as string | null) ?? null,
      storageArea: dolu(p.storage_area_id) ? alanAdi.get(String(p.storage_area_id)) ?? null : null,
      unitCostCents: kabul.purchaseOrderNote === null && dolu(p.purchase_price) ? Math.round(Number(p.purchase_price) * 100) : null,
    });
  }
  // Aynı kabulün partileri aynı anda yazılır ve kayıt sırası koşudan koşuya değişir; sabit sıra olmasa her koşu sahte fark doğururdu.
  const sira = (l: SayimKabulu['lines'][number]) => [l.variant.product, l.variant.label, l.expiryDate, l.lotNumber ?? ''].join('\u0000');
  for (const k of sayim) k.lines.sort((a, b) => sira(a).localeCompare(sira(b), 'tr'));
  const sayimDolu = sayim.filter((k) => k.lines.length > 0);

  if (sorunlar.length > 0) {
    console.error(`✗ ${sorunlar.length} sorun — hiçbir dosya yazılmadı:\n  ${sorunlar.join('\n  ')}`);
    process.exit(1);
  }

  // Dosyanın künye satırları (`_` ile başlayan) veri değildir, korunur.
  const katalogBasligi = Object.fromEntries(
    Object.entries(JSON.parse(readFileSync(join(VERI, 'katalog-kunyeleri.json'), 'utf8')) as Record<string, unknown>).filter(([k]) => k.startsWith('_')),
  );
  const sirali = <T>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b, 'tr')));
  const dosyalar: Array<[string, unknown]> = [
    ['urun-kunyeleri.json', sirali(urunKunyeleri)],
    ['katalog-kunyeleri.json', { ...katalogBasligi, ...sirali(katalogKunyeleri) }],
    ['stok-sayimi.json', sayimDolu],
  ];
  mkdirSync(OUT, { recursive: true });
  // Önce hepsi geçici adla yazılır, sonra yer değiştirir: yarıda kesilen koşu aynayı yarım bırakmaz.
  for (const [ad, icerik] of dosyalar) writeFileSync(join(OUT, `${ad}.yeni`), `${JSON.stringify(diziliDiller(icerik), null, 2)}\n`);
  for (const [ad] of dosyalar) renameSync(join(OUT, `${ad}.yeni`), join(OUT, ad));

  const satirSayisi = sayimDolu.reduce((n, k) => n + k.lines.length, 0);
  const adet = sayimDolu.reduce((n, k) => n + k.lines.reduce((m, l) => m + l.qty, 0), 0);
  console.log(`✓ ${Object.keys(urunKunyeleri).length} ürün künyesi · ${Object.keys(katalogKunyeleri).length} katalog künyesi · ${barkodlar.length} barkod`);
  console.log(`✓ ${sayimDolu.length} kabul · ${satirSayisi} parti · ${adet} adet → ${OUT}`);
  if (rapor.length > 0) console.log(`ⓘ taşınmayan elle değer (${rapor.length}):\n  ${rapor.join('\n  ')}`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
