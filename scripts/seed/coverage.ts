import type { createServiceRoleClient } from '@lezzet/database';

/**
 * İstemci tipi `@supabase/supabase-js`'ten DEĞİL, fabrikanın dönüşünden türetiliyor: `scripts`
 * tsconfig'i o paketi doğrudan görmüyor ve bağımlılık eklemek, yalnız bir tip için ikinci bir
 * sürüm kaynağı açardı.
 */
type Db = ReturnType<typeof createServiceRoleClient>;

/**
 * **SEED KAPSAM DENETİMİ** — "hangi senaryo seed'de HİÇ doğmuyor?" (kullanıcı kararı 09.08)
 *
 * ── NEDEN VAR ────────────────────────────────────────────────────────────────
 * Seed'in çeşitliliği bugüne dek **reaktif** düzeltildi: bir şerit ekranı yazarken bir hâlin hiç
 * doğmadığını fark ediyor, talep açıyor, biz o hâli ekliyoruz. Üç kez böyle oldu (kargolanabilirlik
 * dağılımı, karma paket, kapaksız kategori) ve üçünde de bedeli aynıydı — **ekran, sınanamadığı
 * için yanlış yazıldı ve yanlışlığı ancak canlıya benzeyen veri gelince görüldü.**
 *
 * Daha kötüsü tersi de yaşandı: 05.19'da "bilinçli çeşitlilik örnekleri test verisiydi" denip boş
 * koleksiyon · pasif taslak · kapaksız kayıt seed'den ÇIKARILDI. Yani kapsam sessizce daraldı ve
 * kimse fark etmedi, çünkü kapsamı ÖLÇEN bir şey yoktu.
 *
 * Bu dosya o ölçüm. Bir liste değil bir KAPI: zorunlu işaretli bir kova boş kalırsa çıkış kodu 1.
 *
 * ── KOVA "ZORUNLU" NE DEMEK ──────────────────────────────────────────────────
 * Zorunlu = **bu hâlin bir ekranı ya da bir iş kuralı var** ve o hâl seed'de doğmuyorsa o ekran
 * fiilen sınanmamış demektir. Zorunlu OLMAYAN kovalar bilgi içindir (dağılım sağlıklı mı).
 *
 * Bir kovayı zorunludan çıkarmak serbesttir — ama **gerekçesi buraya yazılır**, sessizce silinmez.
 * Kapsamın daralması bir karar olmalı, bir kaza değil.
 *
 * ── ÖLÇÜM SEED'İN KENDİSİNİ DEĞİL, SONUCUNU OKUR ─────────────────────────────
 * Kaynağı seed kodu değil VERİTABANI: seed'in ne yazmayı amaçladığı değil, ne yazdığı önemli.
 * Guard'a takılıp yarım kalan bir bölüm (yaşandı 08.08, `seedBankQueue`) kodda doğru görünür.
 */

export interface KapsamKovasi {
  ad: string;
  /** Boş kalırsa koşu KIRMIZI döner — bu hâlin bir ekranı/kuralı var. */
  zorunlu?: boolean;
  /** Basit tablo süzgeci. */
  filtre?: (q: PostgrestFilter) => PostgrestFilter;
  /** Süzgeçle ifade edilemeyen kova (yokluk sorgusu, çapraz tablo) — kendi sayısını üretir. */
  sayac?: (db: Db) => Promise<number>;
}

export interface KapsamAlani {
  baslik: string;
  tablo?: string;
  kovalar: KapsamKovasi[];
}

/** PostgREST sorgu kurucusunun bu dosyanın ihtiyaç duyduğu kadarı. */
type PostgrestFilter = {
  eq: (c: string, v: unknown) => PostgrestFilter;
  neq: (c: string, v: unknown) => PostgrestFilter;
  is: (c: string, v: unknown) => PostgrestFilter;
  not: (c: string, o: string, v: unknown) => PostgrestFilter;
  gt: (c: string, v: unknown) => PostgrestFilter;
  lt: (c: string, v: unknown) => PostgrestFilter;
};

/** Bir tablodaki satır sayısı — gövde çekilmez (`head`), yalnız sayı. */
async function say(db: Db, tablo: string, filtre?: KapsamKovasi['filtre']): Promise<number> {
  const q = db.from(tablo).select('*', { count: 'exact', head: true });
  const { count, error } = await (filtre ? (filtre(q as unknown as PostgrestFilter) as unknown as typeof q) : q);
  if (error) throw new Error(`[kapsam] ${tablo}: ${error.message}`);
  return count ?? 0;
}

/** Bir kolondaki DEĞERLERİ toplar — sayım değil, "hangi hâller var" sorusu (KDV oranları gibi). */
async function degerler(db: Db, tablo: string, kolon: string): Promise<unknown[]> {
  const { data, error } = await db.from(tablo).select(kolon);
  if (error) throw new Error(`[kapsam] ${tablo}.${kolon}: ${error.message}`);
  const satirlar = (data ?? []) as unknown as Record<string, unknown>[];
  return [...new Set(satirlar.map((r) => r[kolon]))].sort();
}

/** "Şu tabloda kimliği geçmeyen" — yokluk sorgusu; PostgREST'te tek süzgeçle yazılamıyor. */
async function iliskisizSay(db: Db, tablo: string, kolon: string, hedefTablo: string, hedefKolon: string): Promise<number> {
  const [{ data: hepsi }, { data: bagli }] = await Promise.all([
    db.from(tablo).select('id'),
    db.from(hedefTablo).select(hedefKolon),
  ]);
  const kume = new Set(((bagli ?? []) as unknown as Record<string, unknown>[]).map((r) => r[hedefKolon]));
  const tumu = (hepsi ?? []) as unknown as Record<string, unknown>[];
  return tumu.filter((r) => !kume.has(r[kolon === 'id' ? 'id' : kolon])).length;
}

export const KAPSAM: KapsamAlani[] = [
  {
    baslik: 'Ürün — satış durumu',
    tablo: 'product',
    kovalar: [
      { ad: 'aktif', zorunlu: true, filtre: (q) => q.eq('status', 'active') },
      { ad: 'pasif', zorunlu: true, filtre: (q) => q.eq('status', 'passive') },
      // Aday ürün yalnız keşif akışında görünür (DOMAIN §13) — o akışın tek sınanma yolu bu.
      { ad: 'aday', zorunlu: true, filtre: (q) => q.eq('status', 'candidate') },
    ],
  },
  {
    baslik: 'Ürün — yasal beyan',
    tablo: 'product',
    kovalar: [
      { ad: 'tam', zorunlu: true, filtre: (q) => q.eq('is_incomplete', false) },
      // "Beyan eksik" rozeti ve süzgeci (operasyon katalog) bu kova olmadan hiç çizilmez.
      { ad: 'eksik', zorunlu: true, filtre: (q) => q.eq('is_incomplete', true) },
      { ad: 'alerjensiz', filtre: (q) => q.eq('allergens', '{}') },
      { ad: 'izsiz', filtre: (q) => q.eq('traces', '{}') },
    ],
  },
  {
    baslik: 'Ürün — teslimat',
    tablo: 'product',
    kovalar: [
      { ad: 'kargolanır', zorunlu: true, filtre: (q) => q.eq('shippable', true) },
      // Soğuk zincir: katalog çipi, StockMark, sepet kısıtı ve "karma paket" kuralı buna dayanıyor.
      { ad: 'kargolanmaz', zorunlu: true, filtre: (q) => q.eq('shippable', false) },
    ],
  },
  {
    baslik: 'Ürün — görsel',
    tablo: 'product',
    kovalar: [
      { ad: 'kapaklı', zorunlu: true, filtre: (q) => q.not('image_key', 'is', null) },
      // Kapaksız ürün kartının baş-harf yedeği yalnız burada sınanır (kullanıcı bunu ekranda gördü).
      { ad: 'kapaksız', zorunlu: true, filtre: (q) => q.is('image_key', null) },
    ],
  },
  {
    baslik: 'Ürün — tarih ve raf',
    tablo: 'product',
    kovalar: [
      // DLC = son tüketim tarihi (yasal olarak katı), DDM = tavsiye edilen. İkisi ayrı ekran dili.
      { ad: 'DLC', zorunlu: true, filtre: (q) => q.eq('date_type', 'DLC') },
      { ad: 'DDM', zorunlu: true, filtre: (q) => q.eq('date_type', 'DDM') },
      { ad: 'raf ömrü var', zorunlu: true, filtre: (q) => q.not('shelf_life_days', 'is', null) },
      // Raf ömrü girilmemiş ürün: "kalan %" hesaplanamaz, ekran o satırı basmamalı.
      { ad: 'raf ömrü yok', zorunlu: true, filtre: (q) => q.is('shelf_life_days', null) },
    ],
  },
  {
    baslik: 'Ürün — fiyatlandırma',
    tablo: 'product',
    kovalar: [
      { ad: 'oto fiyat açık', zorunlu: true, filtre: (q) => q.eq('auto_price', true) },
      { ad: 'oto fiyat kapalı', zorunlu: true, filtre: (q) => q.eq('auto_price', false) },
      { ad: 'hedef marj var', zorunlu: true, filtre: (q) => q.not('target_margin_percent', 'is', null) },
      // Marjsız ürün: marj uyarısı hesaplanamaz — "uyarı yok" ile "veri yok" ayrı hâller.
      { ad: 'hedef marj yok', zorunlu: true, filtre: (q) => q.is('target_margin_percent', null) },
    ],
  },
  {
    baslik: 'Ürün — aile (çeşit)',
    tablo: 'product',
    kovalar: [
      { ad: 'aile üyesi', zorunlu: true, filtre: (q) => q.not('family_id', 'is', null) },
      { ad: 'ailesiz', zorunlu: true, filtre: (q) => q.is('family_id', null) },
    ],
  },
  {
    baslik: 'Varyant',
    tablo: 'product_variant',
    kovalar: [
      { ad: 'aktif', zorunlu: true, filtre: (q) => q.eq('is_active', true) },
      // Pasif varyant paketi `listSellable`'dan DÜŞÜRÜR — o kural bu kova olmadan hiç koşmaz.
      { ad: 'pasif', zorunlu: true, filtre: (q) => q.eq('is_active', false) },
      { ad: 'SKU yok', filtre: (q) => q.is('sku', null) },
      // Ağırlıksız varyant: paketin toplam ağırlığı hesaplanamaz, satır basılmamalı.
      { ad: 'ağırlıksız', zorunlu: true, filtre: (q) => q.is('net_weight_g', null) },
    ],
  },
  {
    baslik: 'Kategori',
    tablo: 'category',
    kovalar: [
      { ad: 'aktif', zorunlu: true, filtre: (q) => q.eq('is_active', true) },
      { ad: 'pasif', zorunlu: true, filtre: (q) => q.eq('is_active', false) },
      { ad: 'vitrinde', zorunlu: true, filtre: (q) => q.eq('is_featured', true) },
      { ad: 'vitrin dışı', zorunlu: true, filtre: (q) => q.eq('is_featured', false) },
      { ad: 'kapaklı', zorunlu: true, filtre: (q) => q.not('image_key', 'is', null) },
      // Kapaksız kategori kartı baş harfe düşer (08.26 kararı) — sınanacak tek yer burası.
      { ad: 'kapaksız', zorunlu: true, filtre: (q) => q.is('image_key', null) },
      { ad: 'altyazılı', zorunlu: true, filtre: (q) => q.not('tagline', 'is', null) },
      // Altyazısız kategori altyazısız çizilir; yedek metin UYDURULMAZ (05.17).
      { ad: 'altyazısız', zorunlu: true, filtre: (q) => q.is('tagline', null) },
    ],
  },
  {
    baslik: 'Koleksiyon',
    tablo: 'collection',
    kovalar: [
      { ad: 'aktif', zorunlu: true, filtre: (q) => q.eq('is_active', true) },
      // Pasif koleksiyon = hazırlanan kampanya; vitrin sayacı bunu AYRI söylüyor (05.18).
      { ad: 'pasif', zorunlu: true, filtre: (q) => q.eq('is_active', false) },
      { ad: 'vitrinde', zorunlu: true, filtre: (q) => q.eq('is_featured', true) },
      { ad: 'kapaklı', zorunlu: true, filtre: (q) => q.not('image_key', 'is', null) },
      { ad: 'kapaksız', zorunlu: true, filtre: (q) => q.is('image_key', null) },
      {
        ad: 'üyesiz',
        zorunlu: true,
        // Boş koleksiyon: kartın "0 ürün" hâli ve katalogun boş sonuç ekranı.
        sayac: (db) => iliskisizSay(db, 'collection', 'id', 'product_collections', 'collection_id'),
      },
    ],
  },
  {
    baslik: 'Paket',
    tablo: 'bundle',
    kovalar: [
      { ad: 'aktif', zorunlu: true, filtre: (q) => q.eq('is_active', true) },
      { ad: 'pasif', zorunlu: true, filtre: (q) => q.eq('is_active', false) },
      { ad: 'vitrinde', zorunlu: true, filtre: (q) => q.eq('is_featured', true) },
      { ad: 'kapaklı', zorunlu: true, filtre: (q) => q.not('image_key', 'is', null) },
      { ad: 'kapaksız', zorunlu: true, filtre: (q) => q.is('image_key', null) },
    ],
  },
  {
    baslik: 'Paket kalemi',
    tablo: 'bundle_item',
    kovalar: [
      { ad: 'ücretli', zorunlu: true, filtre: (q) => q.gt('allocated_unit_price', 0) },
      // Hediye kalem = fiyatı 0 (DOMAIN §13): faturada 0 € satır, stoktan normal düşer.
      { ad: 'hediye (0 €)', zorunlu: true, filtre: (q) => q.eq('allocated_unit_price', 0) },
      { ad: 'adet > 1', zorunlu: true, filtre: (q) => q.gt('qty', 1) },
    ],
  },
  {
    baslik: 'Aile · tarif',
    kovalar: [
      { ad: 'aile aktif', zorunlu: true, sayac: (db) => say(db, 'product_family', (q) => q.eq('is_active', true)) },
      // Pasif aile: üyeleri satışta kalır ama çeşit bloğu çizilmez (0004 künyesi).
      { ad: 'aile pasif', zorunlu: true, sayac: (db) => say(db, 'product_family', (q) => q.eq('is_active', false)) },
      { ad: 'tarif aktif', zorunlu: true, sayac: (db) => say(db, 'recipe', (q) => q.eq('is_active', true)) },
      { ad: 'tarif pasif', zorunlu: true, sayac: (db) => say(db, 'recipe', (q) => q.eq('is_active', false)) },
    ],
  },
  {
    baslik: 'Fiyat',
    tablo: 'price',
    kovalar: [
      { ad: 'b2c', zorunlu: true, filtre: (q) => q.eq('channel', 'b2c') },
      { ad: 'b2b', zorunlu: true, filtre: (q) => q.eq('channel', 'b2b') },
      // Müşteriye özel fiyat: sözleşmeli toptancı satırı.
      { ad: 'müşteriye özel', zorunlu: true, filtre: (q) => q.not('customer_id', 'is', null) },
    ],
  },
  {
    baslik: 'Fiyat — yokluk',
    kovalar: [
      {
        ad: 'fiyatsız varyant',
        zorunlu: true,
        // Fiyatı girilmemiş varyant SATIŞA KAPALIDIR ve listenin SONUNDA durur (0043 `sort_price`).
        sayac: (db) => iliskisizSay(db, 'product_variant', 'id', 'price', 'variant_id'),
      },
    ],
  },
  {
    baslik: 'Stok — parti',
    tablo: 'stock',
    kovalar: [
      { ad: 'dolu', zorunlu: true, filtre: (q) => q.gt('physical_qty', 0) },
      // Tükenmiş parti: FEFO'nun atlaması gereken satır; imha/sayım geçmişinde de görünür.
      { ad: 'tükenmiş', zorunlu: true, filtre: (q) => q.eq('physical_qty', 0) },
      // Yakın-SKT teklifi (`offer_price`): fırsat bandının ve teklif çıpasının tek kaynağı.
      { ad: 'teklifli', zorunlu: true, filtre: (q) => q.not('offer_price', 'is', null) },
      { ad: 'tekliflsiz', zorunlu: true, filtre: (q) => q.is('offer_price', null) },
      { ad: 'lot no var', zorunlu: true, filtre: (q) => q.not('lot_number', 'is', null) },
      { ad: 'SKT yok', filtre: (q) => q.is('expiry_date', null) },
      { ad: 'raf yeri var', filtre: (q) => q.not('location', 'is', null) },
    ],
  },
  {
    baslik: 'Fırsat bandı — SONUÇ',
    kovalar: [
      {
        ad: 'fırsat kartı üretebilen',
        zorunlu: true,
        /**
         * **Ham kolon DEĞİL, ekranın göreceği SONUÇ ölçülüyor** (kullanıcı bildirimi 09.08).
         *
         * "Stok — parti / teklifli" kovası doluydu (2 parti) ve rapor YEŞİL diyordu; ana sayfanın
         * fırsat bandı ise BOŞTU. Sebep iki katmerliydi ve ikisi de kovanın göremediği yerdeydi:
         * teklif tutarı liste fiyatından PAHALIYDI (`isOffer` haklı olarak eliyor) ve iki teklifin
         * biri PASİF bir ürüne düşmüştü (`status: 'active'` eliyor).
         *
         * Ders kovanın kendisinden büyük: **bir alanın dolu olması o alanın işe yaradığı anlamına
         * gelmiyor.** Sonuç ölçen kova, ara katmandaki her süzgeci de sınamış olur.
         */
        sayac: async (db) => {
          const { data: partiler } = await db
            .from('stock')
            .select('variant_id,offer_price')
            .not('offer_price', 'is', null)
            .gt('physical_qty', 0);
          const teklifler = (partiler ?? []) as unknown as { variant_id: string; offer_price: number }[];
          if (teklifler.length === 0) return 0;

          const varyantIds = [...new Set(teklifler.map((t) => t.variant_id))];
          const [{ data: varyantlar }, { data: fiyatlar }] = await Promise.all([
            db.from('product_variant').select('id,product_id,is_active').in('id', varyantIds),
            db.from('price').select('variant_id,amount').eq('channel', 'b2c').is('customer_id', null).in('variant_id', varyantIds),
          ]);
          const vRows = (varyantlar ?? []) as unknown as { id: string; product_id: string; is_active: boolean }[];
          const { data: urunler } = await db
            .from('product')
            .select('id,status')
            .in('id', [...new Set(vRows.map((v) => v.product_id))]);
          const aktifUrun = new Set(
            ((urunler ?? []) as unknown as { id: string; status: string }[]).filter((p) => p.status === 'active').map((p) => p.id),
          );
          // Liste fiyatı: aynı varyantta birden çok satır olabilir, EN DÜŞÜĞÜ karşılaştırılır —
          // teklif ancak müşterinin başka türlü ödeyeceği en düşük tutarı yenerse fırsattır.
          const liste = new Map<string, number>();
          for (const f of (fiyatlar ?? []) as unknown as { variant_id: string; amount: number }[]) {
            const cents = Math.round(Number(f.amount) * 100);
            const eski = liste.get(f.variant_id);
            if (eski === undefined || cents < eski) liste.set(f.variant_id, cents);
          }
          const varyant = new Map(vRows.map((v) => [v.id, v]));
          const kazanan = new Set<string>();
          for (const t of teklifler) {
            const v = varyant.get(t.variant_id);
            if (!v?.is_active || !aktifUrun.has(v.product_id)) continue;
            const normal = liste.get(t.variant_id);
            if (normal === undefined || Math.round(Number(t.offer_price) * 100) >= normal) continue;
            kazanan.add(v.product_id);
          }
          return kazanan.size;
        },
      },
    ],
  },
  {
    baslik: 'Depo',
    tablo: 'warehouse',
    kovalar: [
      { ad: 'aktif', zorunlu: true, filtre: (q) => q.eq('is_active', true) },
      // Pasif depo: kapsam seçicisi ve "depo kapandı" hâli.
      { ad: 'pasif', zorunlu: true, filtre: (q) => q.eq('is_active', false) },
      { ad: 'kargo çıkışlı', zorunlu: true, filtre: (q) => q.eq('ships_online', true) },
      { ad: 'yalnız rota', zorunlu: true, filtre: (q) => q.eq('ships_online', false) },
    ],
  },
  {
    baslik: 'Depo — dağılım',
    kovalar: [
      {
        ad: 'tek depoda olan varyant',
        zorunlu: true,
        // 19.22'nin çekirdek senaryosu: kalemleri iki depoya DAĞILMIŞ paket ancak böyle doğar.
        sayac: async (db) => {
          const { data } = await db.from('stock').select('variant_id,warehouse_id').gt('physical_qty', 0);
          const depolar = new Map<string, Set<string>>();
          for (const r of (data ?? []) as { variant_id: string; warehouse_id: string }[]) {
            if (!depolar.has(r.variant_id)) depolar.set(r.variant_id, new Set());
            depolar.get(r.variant_id)!.add(r.warehouse_id);
          }
          return [...depolar.values()].filter((s) => s.size === 1).length;
        },
      },
      {
        ad: 'iki depoda olan varyant',
        zorunlu: true,
        sayac: async (db) => {
          const { data } = await db.from('stock').select('variant_id,warehouse_id').gt('physical_qty', 0);
          const depolar = new Map<string, Set<string>>();
          for (const r of (data ?? []) as { variant_id: string; warehouse_id: string }[]) {
            if (!depolar.has(r.variant_id)) depolar.set(r.variant_id, new Set());
            depolar.get(r.variant_id)!.add(r.warehouse_id);
          }
          return [...depolar.values()].filter((s) => s.size > 1).length;
        },
      },
    ],
  },
  {
    baslik: 'Bölge · transfer',
    kovalar: [
      { ad: 'bölge aktif', zorunlu: true, sayac: (db) => say(db, 'delivery_zone', (q) => q.eq('is_active', true)) },
      { ad: 'bölge pasif', zorunlu: true, sayac: (db) => say(db, 'delivery_zone', (q) => q.eq('is_active', false)) },
      { ad: 'transfer', zorunlu: true, sayac: (db) => say(db, 'warehouse_transfer') },
    ],
  },
  {
    baslik: 'Sipariş — yol ve kanal',
    tablo: 'order',
    kovalar: [
      { ad: 'rota', zorunlu: true, filtre: (q) => q.eq('delivery_type', 'route') },
      { ad: 'kargo', zorunlu: true, filtre: (q) => q.eq('delivery_type', 'shipping') },
      { ad: 'b2c', zorunlu: true, filtre: (q) => q.eq('channel', 'b2c') },
      { ad: 'b2b', zorunlu: true, filtre: (q) => q.eq('channel', 'b2b') },
      { ad: 'vadeli', zorunlu: true, filtre: (q) => q.eq('on_account', true) },
    ],
  },
];

/** Sipariş DURUMLARI ayrı: kova listesi enum'dan gelmeli, elle yazılan liste enum büyüyünce eskir. */
export const SIPARIS_DURUMLARI = [
  'draft', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'completed', 'cancelled', 'returned',
] as const;

export interface KapsamSonucu {
  satirlar: { alan: string; kova: string; sayi: number; zorunlu: boolean }[];
  bosZorunlular: { alan: string; kova: string }[];
  kdvOranlari: unknown[];
}

export async function kapsamOl(db: Db): Promise<KapsamSonucu> {
  const satirlar: KapsamSonucu['satirlar'] = [];
  const bosZorunlular: KapsamSonucu['bosZorunlular'] = [];

  for (const alan of KAPSAM) {
    for (const kova of alan.kovalar) {
      const sayi = kova.sayac ? await kova.sayac(db) : await say(db, alan.tablo!, kova.filtre);
      satirlar.push({ alan: alan.baslik, kova: kova.ad, sayi, zorunlu: kova.zorunlu === true });
      if (kova.zorunlu && sayi === 0) bosZorunlular.push({ alan: alan.baslik, kova: kova.ad });
    }
  }

  // Sipariş durumları — dokuzunun da örneği olmalı: her biri ayrı bir ekran hâli ve ayrı geçiş.
  for (const durum of SIPARIS_DURUMLARI) {
    const sayi = await say(db, 'order', (q) => q.eq('status', durum));
    satirlar.push({ alan: 'Sipariş — durum', kova: durum, sayi, zorunlu: true });
    if (sayi === 0) bosZorunlular.push({ alan: 'Sipariş — durum', kova: durum });
  }

  return { satirlar, bosZorunlular, kdvOranlari: await degerler(db, 'product', 'vat_rate') };
}
