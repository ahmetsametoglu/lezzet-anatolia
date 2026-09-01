import { listOrderExceptions } from '@lezzet/application';
import type { createServiceRoleClient } from '@lezzet/database';
import { AssistantProposalKindEnum } from '@lezzet/types';

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

interface KapsamKovasi {
  ad: string;
  /** Boş kalırsa koşu KIRMIZI döner — bu hâlin bir ekranı/kuralı var. */
  zorunlu?: boolean;
  /** Basit tablo süzgeci. */
  filtre?: (q: PostgrestFilter) => PostgrestFilter;
  /** Süzgeçle ifade edilemeyen kova (yokluk sorgusu, çapraz tablo) — kendi sayısını üretir. */
  sayac?: (db: Db) => Promise<number>;
}

interface KapsamAlani {
  baslik: string;
  tablo?: string;
  kovalar: KapsamKovasi[];
  /**
   * **BU ALAN SİPARİŞ İSTİYOR ve besleme artık sipariş yazmıyor** (kullanıcı kararı 01.09).
   *
   * Kovalar SİLİNMEDİ ve bu bilinçli: dosyanın kendi kuralı *"bir kovayı zorunludan çıkarmak
   * serbesttir — ama gerekçesi buraya yazılır, sessizce silinmez"*. Silinseydi bu ekranların
   * hangi hâllere ihtiyaç duyduğu kayıttan düşer, ve sipariş bir gün beslemeye geri gelse kimse
   * neyi geri açacağını bilemezdi.
   *
   * İşaretli alanın kovaları RAPORLANIR ama koşuyu KIRMIZIYA ÇEVİRMEZ: boş olmaları bir eksik
   * değil, beslemenin kararının sonucudur. Kullanıcı bir sipariş oluşturduğu anda dolmaya
   * başlarlar ve rapor yine doğruyu söyler.
   */
  siparisGerektirir?: boolean;
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

/** N gün öncesinin ISO damgası — yaş kovalarının eşiği (eşiğin kendisi `domain-core`da). */
const gunOnce = (n: number): string => new Date(Date.now() - n * 86_400_000).toISOString();

/** Bugünün tarihi (`YYYY-MM-DD`) — GÜN ölçütlü kovalar için; seed'in `gun(0)`'ı ile aynı gün. */
const bugun = (): string => new Date().toISOString().slice(0, 10);

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

/**
 * Parti bazında marj dağılımı — **alış fiyatı liste fiyatını tanıyor mu** sorusunun ölçümü.
 *
 * Karşılaştırma KDV HARİÇ yapılır (`liste / (1 + kdv/100)`): alış zaten hariç ve ikisini ham
 * karşılaştırmak her partiyi yapay olarak kârlı gösterirdi.
 *
 * Tek turda üç okuma; küme sınırlı (parti sayısı) ve gün başına değil TOPLAM sorulduğu için
 * sayfalama gerekmiyor.
 */
async function marjDagilimi(db: Db): Promise<{ zarar: number; kar: number }> {
  const [{ data: partiler }, { data: fiyatlar }, { data: varyantlar }, { data: urunler }] = await Promise.all([
    db.from('stock').select('variant_id,purchase_price').not('purchase_price', 'is', null),
    db.from('price').select('variant_id,amount').eq('channel', 'b2c').is('customer_id', null),
    db.from('product_variant').select('id,product_id'),
    db.from('product').select('id,vat_rate'),
  ]);

  const kdvOf = new Map(((urunler ?? []) as unknown as { id: string; vat_rate: number }[]).map((u) => [u.id, u.vat_rate]));
  const urunOf = new Map(((varyantlar ?? []) as unknown as { id: string; product_id: string }[]).map((v) => [v.id, v.product_id]));
  const listeOf = new Map(((fiyatlar ?? []) as unknown as { variant_id: string; amount: number }[]).map((f) => [f.variant_id, f.amount]));

  let zarar = 0;
  let kar = 0;
  for (const p of (partiler ?? []) as unknown as { variant_id: string; purchase_price: number }[]) {
    const liste = listeOf.get(p.variant_id);
    const kdv = kdvOf.get(urunOf.get(p.variant_id) ?? '');
    if (liste === undefined || kdv === undefined) continue;
    if (liste / (1 + kdv / 100) < p.purchase_price) zarar += 1;
    else kar += 1;
  }
  return { zarar, kar };
}

const KAPSAM: KapsamAlani[] = [
  {
    baslik: 'Ürün — satış durumu',
    tablo: 'product',
    kovalar: [
      { ad: 'aktif', zorunlu: true, filtre: (q) => q.eq('status', 'active') },
      { ad: 'pasif', zorunlu: true, filtre: (q) => q.eq('status', 'passive') },
      // Aday ürün yalnız keşif akışında görünür (DOMAIN §13) — o akışın tek sınanma yolu bu.
      { ad: 'aday', zorunlu: true, filtre: (q) => q.eq('status', 'candidate') },
      {
        // ── "TÜKENDİ" HÂLİ GEÇMİŞİYLE BİRLİKTE VAR MI (16.08) ────────────────────────────────
        // 16.08'e kadar aktif ürünlerin yarısı (53/116) "tükendi" görünüyordu ve hiçbirinin stok
        // partisi YOKTU — yani hâl yoklukan doğuyordu. Artık tersi: stoklanmayacak ürün aday
        // doğuyor, tükeniş ise bilinçli olarak BİTMİŞ partiyle kuruluyor.
        //
        // Bu kova o dengeyi kilitliyor. Çünkü düzeltmenin kendi riski var: aday sayısı artarken
        // "tükendi" hâli sıfıra da inebilirdi ve o zaman rozet, pasif sepet düğmesi ve "gelince
        // haber ver" akışı seed'de hiç sınanmazdı. Ölçüt SATIRIN VARLIĞI — partisi olmayan bir
        // varyant bu kovaya giremez, çünkü aranan tam olarak "geçmişi olan tükeniş".
        ad: 'TÜKENMİŞ aktif ürün (partisi VAR, miktarı 0)',
        zorunlu: true,
        sayac: async (db) => {
          const { data: partiler, error: pHata } = await db.from('stock').select('variant_id,physical_qty');
          if (pHata) throw new Error(`[kapsam] stock: ${pHata.message}`);
          const toplam = new Map<string, number>();
          for (const s of (partiler ?? []) as Array<{ variant_id: string; physical_qty: number }>) {
            toplam.set(s.variant_id, (toplam.get(s.variant_id) ?? 0) + Number(s.physical_qty));
          }
          const bitmis = [...toplam].flatMap(([id, n]) => (n === 0 ? [id] : []));
          if (bitmis.length === 0) return 0;
          const { data: varyantlar, error: vHata } = await db.from('product_variant').select('product_id').in('id', bitmis);
          if (vHata) throw new Error(`[kapsam] product_variant: ${vHata.message}`);
          const urunIdler = [...new Set(((varyantlar ?? []) as Array<{ product_id: string }>).map((v) => v.product_id))];
          if (urunIdler.length === 0) return 0;
          const { count, error } = await db.from('product').select('*', { count: 'exact', head: true }).eq('status', 'active').in('id', urunIdler);
          if (error) throw new Error(`[kapsam] product: ${error.message}`);
          return count ?? 0;
        },
      },
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
    // ── SAKLAMA REJİMİ — `shippable`IN KOVASI DEĞİL (16.08, `product.storage_type`) ─────────────
    // Ayrı bir alan olmasının sebebi migration `0005`te yazılı: `shippable` bir TESLİMAT olgusu
    // ("kargoya verilemez"), bu bir SAKLAMA olgusu. İkisi çoğu üründe birlikte hareket eder ama
    // aynı şey değildir — ve tam olarak bu yüzden ayrı ölçülmeleri gerekir: `shippable` kovaları
    // dolu görünürken üç saklama değerinden ikisi hiç doğmamış olabilir.
    //
    // Üçü de ZORUNLU, çünkü üçünün de ayrı bir ekran sonucu var:
    //   frozen  → iade varsayılanı İMHA (`ReturnDispositionEnum`) + vitrin soğuk zincir işareti
    //   chilled → vitrin işareti çıkar ama iade imhaya düşmez — ikisini ayıran tek kayıt bu
    //   ambient → işaret HİÇ çıkmaz; "işaret yok" hâli de ancak böyle bir ürünle sınanır
    //
    // `base` katmanında ikisi boş kalır ve bu beklenendir: kaynakta yalnız `frozen` kanıtı var
    // (belgesi olan altı ürünün altısı da "-18°C"). Kapsam vaadi zaten yalnız `full` içindir.
    baslik: 'Ürün — saklama rejimi (soğuk zincir)',
    tablo: 'product',
    kovalar: [
      { ad: 'donuk (frozen)', zorunlu: true, filtre: (q) => q.eq('storage_type', 'frozen') },
      { ad: 'soğutulmuş (chilled)', zorunlu: true, filtre: (q) => q.eq('storage_type', 'chilled') },
      { ad: 'oda sıcaklığı (ambient)', zorunlu: true, filtre: (q) => q.eq('storage_type', 'ambient') },
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
    baslik: 'Kargo kutusu',
    tablo: 'shipping_box',
    kovalar: [
      // Şablonlar migration'ın kurduğu kalıcı kayıtlar — biri silinirse benimseme yolu kırılır.
      { ad: 'sistem şablonu', zorunlu: true, filtre: (q) => q.is('warehouse_id', null) },
      { ad: 'deponun kendi kutusu', zorunlu: true, filtre: (q) => q.not('warehouse_id', 'is', null) },
      // Kapalı kutu: listede görünür, seçicide görünmez. İki ayrı okumanın tek kaynağı.
      { ad: 'kapalı kutu', zorunlu: true, filtre: (q) => q.eq('is_active', false) },
      // Azami içerik bildirilmemiş kutu — "sınır bilinmiyor" ile "sınır yok" ayrımının kaynağı.
      { ad: 'azami içerik bildirilmiş', filtre: (q) => q.not('max_content_g', 'is', null) },
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
      /*
        AMBALAJ ÖLÇÜSÜ — ÜÇ HÂL, üçü de zorunlu (28.08). Kargo kanalının girdisi ve her hâlin
        ekranda ayrı bir karşılığı var; biri hiç doğmazsa o karşılık sınanmamış olur:
          ölçülü  → canlı teklif alınabilir
          yarım   → tartılmış ama ölçülmemiş; kısıt buna İZİN veriyor ve ekran ayırt etmeli
          ölçüsüz → "ölçüsü eksik" süzgecinin ve teklif reddinin tek kaynağı
      */
      { ad: 'ambalajı ölçülü', zorunlu: true, filtre: (q) => q.not('packed_length_mm', 'is', null) },
      {
        ad: 'ambalajı yarım ölçülü (tartıldı, ölçülmedi)',
        zorunlu: true,
        filtre: (q) => q.not('packed_weight_g', 'is', null).is('packed_length_mm', null),
      },
      { ad: 'ambalajı ölçüsüz', zorunlu: true, filtre: (q) => q.is('packed_weight_g', null) },
      {
        ad: 'paket içi adet bildirilmiş',
        zorunlu: true,
        /**
         * `pieces_count` (05.14) — *"12'li baklava"*. Alan yokken adet adın içinde kalıyordu ve
         * slug ayrıştığı için **tek baklava dört ayrı ürüne bölünüyordu** (ölçüldü 08.08: 10 kayıt,
         * 2 ürün olmalı). Üreteç düzeltildi; kova ölçümün SONUCUNU sorar — kolon dolduruluyor mu.
         */
        filtre: (q) => q.not('pieces_count', 'is', null),
      },
      // Dökme ürün adet bildirmez. `null` ile 0'ın ayrı şeyler olduğu ancak ikisi de varsa görünür.
      { ad: 'adet bildirilmemiş (dökme)', zorunlu: true, filtre: (q) => q.is('pieces_count', null) },
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
      // Raf artık TANIMLI alan (19.29), serbest metin değil. İki hâl de zorunlu: rafı bilinen parti
      // "bu alanda ne var" sorusunu, rafsız parti `null` yolunu sınıyor (kabulde alan seçmek
      // zorunlu değil ve ekranlar o hâli de çiziyor).
      { ad: 'alanı olan parti', zorunlu: true, filtre: (q) => q.not('storage_area_id', 'is', null) },
      { ad: 'rafı bilinmeyen parti', zorunlu: true, filtre: (q) => q.is('storage_area_id', null) },
      { ad: 'alış fiyatı GİRİLMEMİŞ', zorunlu: true, filtre: (q) => q.is('purchase_price', null) },
      {
        ad: 'MARJ ALTI parti (bilinçli istisna)',
        zorunlu: true,
        /**
         * **Alış fiyatı listeden TÜRÜYOR mu, yoksa uydurma mı** (denetim bulgusu 09.08).
         *
         * Seed alışı sabit bir formülle üretiyordu (2,10-4,50 €) ve varyantın gerçek fiyatına HİÇ
         * bakmıyordu. Katalogda liste 1,49-78,24 € arasında; sonuç **44 varyant zararına satılıyor
         * görünüyordu** (en kötüsü −2,07 €). Gürültü değil: MCP asistanına maliyet okuması açılınca
         * (22.5) bu veriye bakıp **zararına bir paket önerdi** — araç doğru, model doğru, veri yalan.
         *
         * Kova iki yönlü çalışır: marj altı parti **hiç yoksa** kârlılık uyarısının ekranı sınanmaz;
         * ama sayı yükselirse (eski hâl) alışın listeden türemediği anlaşılır. İkinci kova kârlı
         * tarafı tutuyor — ikisi birlikte "hem var hem kural değil" demeye yarıyor.
         */
        sayac: async (db) => (await marjDagilimi(db)).zarar,
      },
      { ad: 'kârlı parti', zorunlu: true, sayac: async (db) => (await marjDagilimi(db)).kar },
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
      // Araç deposu (26.08): türün üç kuralı — bölge bağlanamaz · kargo çıkışı olamaz ·
      // depo-üstü toplama girmez — ancak ortada bir araç satırı varsa koşar.
      { ad: 'tesis', zorunlu: true, filtre: (q) => q.eq('kind', 'facility') },
      { ad: 'araç', zorunlu: true, filtre: (q) => q.eq('kind', 'vehicle') },
    ],
  },
  {
    // ── ÜRÜN BARKODU (Modül 23) ───────────────────────────────────────────────────────────────
    // Dört kova dört ayrı davranışı açıyor: paket kodu (çarpan 1) ↔ koli kodu (çarpan kadar öner) ·
    // öğrenilmiş kod (izli — "kim öğretti") ↔ sistem kaydı (izsiz). "Tanınmayan kod" hâli kovasızdır
    // ve bilinçli: onu var eden şey kodsuz KALAN varyantlardır — katalogun tamamına kod yazılsaydı
    // öğrenen eşleme ekranı hiçbir koşuda açılmazdı (seed künyesi).
    baslik: 'Ürün barkodu',
    tablo: 'variant_barcode',
    kovalar: [
      { ad: 'paket kodu (unit)', zorunlu: true, filtre: (q) => q.eq('kind', 'unit') },
      { ad: 'koli kodu (case, çarpanlı)', zorunlu: true, filtre: (q) => q.eq('kind', 'case') },
      { ad: 'öğrenilmiş kod (izli)', zorunlu: true, filtre: (q) => q.not('created_by', 'is', null) },
      { ad: 'sistem kaydı (izsiz)', zorunlu: true, filtre: (q) => q.is('created_by', null) },
    ],
  },
  {
    /*
      ── KARGO GÖNDERİSİ (07.12) ────────────────────────────────────────────────────────────────
      Üç ekranın görünürlüğü buna bağlı: müşteri sipariş detayının takip bloğu, operasyon sipariş
      detayının gönderi künyesi ve "yolda" mailinin takip kutusu. Kova açılmadan önce `shipment`
      tablosunda TEK satır yoktu — üçü de yalnız testlerde görülebiliyordu.

      **ÇOK KOLİ ayrı kova ve zorunlu:** "her kolinin AYRI takip numarası var" kuralı tek kolili
      veride hiçbir ekranda görünmez — ve o kural bir kez tam bu yüzden yanlış yazıldı (tek numara
      varsayılmıştı, çok kutulu siparişin ikisi görünmez kalıyordu).
    */
    baslik: 'Kargo gönderisi',
    tablo: 'shipment',
    siparisGerektirir: true,
    kovalar: [
      { ad: 'taşıyıcıda (tek koli)', zorunlu: true, filtre: (q) => q.eq('status', 'handed_over') },
      { ad: 'yolda (çok koli)', zorunlu: true, filtre: (q) => q.eq('status', 'in_transit') },
    ],
  },
  {
    // ── SİPARİŞ KUTUSU (23.6) ─────────────────────────────────────────────────────────────────
    // Kutu döngüsünün dört hâli, dördü de ayrı bir ekran/kural açıyor: AÇIK kutu = masada
    // dolduruluyor (yarım iş kaldığı yerden sürer), KAPALI = salt-okunur + etiketi basılacak,
    // YÜKLENMEMİŞ = 23.8'in yükleme sayacının "kaç kaldı" tarafı, ÇOK KUTULU = absolüt birleşim
    // (0048 ⚠) ve "tüm kutular binmeden yolda sayılmaz" kuralının tek sınanabildiği hâl.
    baslik: 'Sipariş kutusu',
    tablo: 'order_box',
    siparisGerektirir: true,
    kovalar: [
      { ad: 'açık kutu', zorunlu: true, filtre: (q) => q.is('sealed_at', null) },
      { ad: 'kapalı kutu', zorunlu: true, filtre: (q) => q.not('sealed_at', 'is', null) },
      {
        ad: 'kapalı ama yüklenmemiş',
        zorunlu: true,
        sayac: (db) => say(db, 'order_box', (q) => q.not('sealed_at', 'is', null).is('loaded_at', null)),
      },
      {
        /*
          ARAÇTA olan kutu — ZORUNLUDAN ÇIKTI (kullanıcı kararı 01.09).

          Seed bu kovayı `loadBox` çağırarak dolduruyordu, yani kuryenin işini önceden yapıyordu.
          Kullanıcı cihazda gördü: *"Sefer açıyorum, 'araçta kutu var' diyor — hâlbuki ben hiçbir
          şey okutmadım."* Yeni kural: **seed sipariş üretir, kutuyu depo üretir, yüklemeyi kurye
          yapar.** Yüklenmiş kutu artık bir SEED hâli değil, akışın sonucu.

          Kova raporlanmaya devam ediyor: kurye bir kutu okuttuğunda dolar ve o an görünür. Boşken
          de hangi hâlin seed'de sınanmadığı yazılı kalır.
        */
        ad: 'araçta (yüklenmiş) kutu',
        zorunlu: false,
        sayac: (db) => say(db, 'order_box', (q) => q.not('loaded_at', 'is', null)),
      },
      {
        ad: 'çok kutulu sipariş (2+)',
        zorunlu: true,
        sayac: async (db) => {
          const { data, error } = await db.from('order_box').select('order_id');
          if (error) throw new Error(`[kapsam] order_box: ${error.message}`);
          const sayilar = new Map<string, number>();
          for (const r of (data ?? []) as Array<{ order_id: string }>) {
            sayilar.set(r.order_id, (sayilar.get(r.order_id) ?? 0) + 1);
          }
          return [...sayilar.values()].filter((n) => n >= 2).length;
        },
      },
    ],
  },
  {
    // ── ÖLÇÜM NOKTALARI (19.28) ───────────────────────────────────────────────────────────────
    // Ölçüm noktası serbest metinden tanımlı kayda geçti; kapsam da onunla birlikte doğdu.
    // Dördü de ZORUNLU çünkü dördü de AYRI bir ekran hâlini açıyor:
    //   hedefli alan   → sapma "beklenen aralık dışı" (kesin ölçüt) diye yazılır
    //   hedefsiz alan  → sapma alışkanlıktan tahmin edilir; ilk günlerde SUSAR
    //   hiç ölçülmemiş → Depolar'daki "tanımlı ama tura girmemiş" uyarısı
    //   araç           → soğuk zincirin yoldaki yeri; ayrı tablo, aynı liste
    baslik: 'Ölçüm noktası (soğuk zincir)',
    kovalar: [
      {
        ad: 'hedef aralığı olan alan',
        zorunlu: true,
        sayac: (db) => say(db, 'storage_area', (q) => q.not('target_min_c', 'is', null)),
      },
      {
        ad: 'hedefsiz alan (geçiş/raf)',
        zorunlu: true,
        sayac: (db) => say(db, 'storage_area', (q) => q.is('target_min_c', null)),
      },
      { ad: 'araç', zorunlu: true, sayac: (db) => say(db, 'vehicle', (q) => q) },
      // Takvimin "eksik gün" ölçütü (19.30) İKİ YÖNLÜ sınanmalı: günlük ölçüm bekleyen nokta
      // boş günlerini eksik gösterir, beklemeyen nokta göstermez. Yalnız biri seed'de olsaydı
      // öteki yolun hiç koşmadığı fark edilmezdi.
      {
        ad: 'günlük ölçüm bekleyen nokta',
        zorunlu: true,
        sayac: (db) => say(db, 'storage_area', (q) => q.gt('expected_daily_checks', 0)),
      },
      {
        ad: 'ölçüm beklenmeyen nokta',
        zorunlu: true,
        sayac: (db) => say(db, 'storage_area', (q) => q.eq('expected_daily_checks', 0)),
      },
      // Partinin rafı BURADA DEĞİL, "Stok — parti" alanında sayılıyor: soru alanın değil PARTİNİN
      // hâli ("rafı biliniyor mu"). İki yerde sormak aynı sayıyı iki başlık altında raporlardı.
      {
        ad: 'hiç ölçülmemiş nokta',
        zorunlu: true,
        // Ölçümü olan alanların kimliklerini çıkarıp farkı sayıyoruz: "kaydı olmayan" sorusu tek
        // sorguyla sorulamıyor (PostgREST'te `not in (subquery)` yok).
        sayac: async (db) => {
          const [{ data: alanlar }, { data: kayitlar }] = await Promise.all([
            db.from('storage_area').select('id'),
            db.from('temperature_log').select('storage_area_id').not('storage_area_id', 'is', null),
          ]);
          const olculen = new Set((kayitlar ?? []).map((r) => (r as { storage_area_id: string }).storage_area_id));
          return (alanlar ?? []).filter((r) => !olculen.has((r as { id: string }).id)).length;
        },
      },
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
      {
        ad: 'karma sepet üretebilen varyant (kargo deposunda VAR, rota deposunda YOK)',
        zorunlu: true,
        /**
         * **19.25'in ölçülebilir karşılığı.** Senaryo iki kez (10.08 · 15.08) "üretilemiyor" diye
         * raporlandı ve sebebi kod değil VERİYDİ: her rota STR'ye bağlıydı, STR aynı zamanda kargo
         * çıkışıydı, dolayısıyla `decideCartAgainstWarehouse` iki havuzu tek yerden okuyordu ve
         * `shipping` yolu rota içi bir adres için doğamıyordu.
         *
         * Kova o boşluğun geri gelmesini engelliyor: sayı sıfıra düşerse **iki gruplu sepet artık
         * üretilemiyor** demektir — ve o zaman iki grup başlığı, "kargolu ürünleri ayrıca sipariş
         * ver" akışı, `shippingSubtotalCents` matrahı ve kargo KDV'sinin oransal bölünmesi yine
         * hiçbir koşuda koşmaz. Sessizce kaybolmasın diye ZORUNLU.
         *
         * Ölçüt kalemin kendisi: kargolanabilir, kargo deposunda var, müşterinin rota deposunda yok.
         */
        sayac: async (db) => {
          const [{ data: depoSatirlari }, { data: bolgeSatirlari }, { data: stokSatirlari }, { data: varyantSatirlari }, { data: urunSatirlari }] =
            await Promise.all([
              db.from('warehouse').select('id,ships_online').eq('is_active', true),
              db.from('delivery_zone').select('warehouse_id').eq('is_active', true),
              db.from('stock').select('variant_id,warehouse_id').gt('physical_qty', 0),
              db.from('product_variant').select('id,product_id'),
              db.from('product').select('id').eq('shippable', true),
            ]);

          const kargoDepolari = new Set(
            ((depoSatirlari ?? []) as { id: string; ships_online: boolean }[]).filter((d) => d.ships_online).map((d) => d.id),
          );
          // Rota deposu ama kargo çıkışı DEĞİL: senaryonun tek ön koşulu bu depoların varlığı.
          const yalnizRotaDepolari = [
            ...new Set(((bolgeSatirlari ?? []) as { warehouse_id: string }[]).map((z) => z.warehouse_id)),
          ].filter((id) => !kargoDepolari.has(id));
          if (yalnizRotaDepolari.length === 0 || kargoDepolari.size === 0) return 0;

          const kargolanabilir = new Set(((urunSatirlari ?? []) as { id: string }[]).map((p) => p.id));
          const urunuyle = new Map(((varyantSatirlari ?? []) as { id: string; product_id: string }[]).map((v) => [v.id, v.product_id]));
          const depoyaGore = new Map<string, Set<string>>();
          for (const r of (stokSatirlari ?? []) as { variant_id: string; warehouse_id: string }[]) {
            if (!depoyaGore.has(r.variant_id)) depoyaGore.set(r.variant_id, new Set());
            depoyaGore.get(r.variant_id)!.add(r.warehouse_id);
          }

          let sayi = 0;
          for (const [variantId, depolari] of depoyaGore) {
            const urunId = urunuyle.get(variantId);
            if (!urunId || !kargolanabilir.has(urunId)) continue;
            const kargodaVar = [...kargoDepolari].some((id) => depolari.has(id));
            const rotadaYok = yalnizRotaDepolari.some((id) => !depolari.has(id));
            if (kargodaVar && rotadaYok) sayi += 1;
          }
          return sayi;
        },
      },
    ],
  },
  {
    baslik: 'Bölge · transfer',
    kovalar: [
      { ad: 'bölge aktif', zorunlu: true, sayac: (db) => say(db, 'delivery_zone', (q) => q.eq('is_active', true)) },
      /**
       * **ZORUNLULUKTAN ÇIKARILDI (kullanıcı kararı 16.08: "rota sayısını bire indirelim").**
       *
       * Seed tek bölge kuruyor ve o aktif; pasif bölge artık doğmuyor. Kovanın kendisi DURUYOR —
       * silinmedi, çünkü ölçmeye devam etmesi gerek: bir gün ikinci bir bölge eklenirse pasif hâlin
       * yeniden doğduğu buradan görülür. Zorunluluğu kalkan tek şey, boşken koşuyu kırması.
       *
       * **Kapsam kaybı kayda geçsin ve küçümsenmesin:** "bölge kapalı, talep birikiyor" hâli artık
       * seed'de doğmuyor. O hâli okuyan ekranlar (bölge listesinde pasif rozeti, `zone_notice`'ın
       * "bölge açılınca haber ver" kuyruğu) yerelde elle bölge kapatılmadan görülemez. `zone_notice`
       * kuyruğunun kendisi yaşıyor (77694 Kehl kaydı bekliyor) — kopan yalnız bölge tarafı.
       */
      { ad: 'bölge pasif', zorunlu: false, sayac: (db) => say(db, 'delivery_zone', (q) => q.eq('is_active', false)) },
      { ad: 'transfer', zorunlu: true, sayac: (db) => say(db, 'warehouse_transfer') },
      /**
       * Transferin DÖRT hâli ayrı kovadır (19.6): ekran her hâli başka çizer — yoldaki liste,
       * gecikmiş amber şerit, geçmişte "Tam/Kısmi kabul" ve "Sevk geri alındı" rozetleri. Toplam
       * sayı dördü birden 0 olmadan da tutar; hâl kovası olmasa biri sessizce kaybolurdu.
       */
      { ad: 'transfer yolda', zorunlu: true, sayac: (db) => say(db, 'warehouse_transfer', (q) => q.eq('status', 'in_transit')) },
      {
        ad: 'transfer yolda GECİKMİŞ',
        zorunlu: true,
        sayac: (db) =>
          say(db, 'warehouse_transfer', (q) =>
            q.eq('status', 'in_transit').lt('dispatched_at', new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()),
          ),
      },
      { ad: 'transfer kabul edilmiş', zorunlu: true, sayac: (db) => say(db, 'warehouse_transfer', (q) => q.eq('status', 'received')) },
      { ad: 'transfer geri alınmış', zorunlu: true, sayac: (db) => say(db, 'warehouse_transfer', (q) => q.eq('status', 'cancelled')) },
    ],
  },
  {
    baslik: 'Yer çözümü',
    kovalar: [
      {
        ad: 'rota İÇİ posta kodu',
        zorunlu: true,
        sayac: (db) => say(db, 'delivery_zone_postal_code'),
      },
      {
        ad: 'rota DIŞI ama hizmette',
        zorunlu: true,
        /**
         * **Rota dışı müşteri — 19.23'ün kaçırıldığı hâl.**
         *
         * "Dört stok hâli" (available · shipping · elsewhere · out_of_stock) yazıldı, test edildi
         * ve ÇALIŞIYOR — ama hep KEHL müşterisiyle denendi: rota İÇİNDE olup kendi deposunda mal
         * bulunmayan müşteri. O senaryoda iki depo farklı, sistem ayırt edebiliyor.
         *
         * **Rota DIŞI müşteri hiç denenmedi** ve orada iki depo aynı kimliğe düşüyordu (rota
         * çözümü kargo deposunu `warehouseId` alanında döndürüyor). Sonuç: 75011 ile 67000 birebir
         * aynı çıktıyı veriyordu — sistem Parisli müşterinin Strasbourg'da olduğuna inanıyordu.
         *
         * Kova bunu doğrudan soramaz (çözüm bir fonksiyon, tablo değil) ama ÖN KOŞULUNU sorar:
         * hizmet verdiğimiz ülkede, hiçbir rota bölgesine ait OLMAYAN bir posta kodu var mı?
         * Yoksa rota dışı senaryo hiçbir ölçümde doğamaz.
         */
        sayac: async (db) => {
          const [{ data: rotaKodlari }, { data: referans }] = await Promise.all([
            db.from('delivery_zone_postal_code').select('country,postal_code'),
            db.from('postal_code_place').select('country,postal_code').eq('country', 'FR').limit(2000),
          ]);
          const rota = new Set(
            ((rotaKodlari ?? []) as unknown as { country: string; postal_code: string }[]).map((r) => `${r.country}:${r.postal_code}`),
          );
          const hepsi = (referans ?? []) as unknown as { country: string; postal_code: string }[];
          return hepsi.filter((r) => !rota.has(`${r.country}:${r.postal_code}`)).length;
        },
      },
      {
        ad: 'kargo çıkış deposu',
        zorunlu: true,
        // Rota dışı müşterinin TEK yolu. Yoksa çözüm `unresolved` döner ve senaryo yine doğmaz.
        sayac: (db) => say(db, 'warehouse', (q) => q.eq('ships_online', true).eq('is_active', true)),
      },
    ],
  },
  {
    baslik: 'Bölge talebi (haber-ver)',
    tablo: 'zone_notice',
    kovalar: [
      { ad: 'bekleyen (haber gitmemiş)', zorunlu: true, filtre: (q) => q.is('notified_at', null) },
      // Gönderim akışının çalıştığı görülmezse "damga yazılıyor mu" hiç sınanmaz.
      { ad: 'haber verilmiş', zorunlu: true, filtre: (q) => q.not('notified_at', 'is', null) },
      { ad: 'kayıtlı müşteriye bağlı', zorunlu: true, filtre: (q) => q.not('customer_id', 'is', null) },
      // Hesap zorunlu DEĞİL; ziyaretçi kaydı hiç doğmazsa o dal (profilsiz dil çözümü) koşmaz.
      { ad: 'ziyaretçi (hesapsız)', zorunlu: true, filtre: (q) => q.is('customer_id', null) },
      {
        ad: 'ALMAN kayıt (ülke ayrımı)',
        zorunlu: true,
        /**
         * **21.16'nın tek denek taşı.** Ülke kolonu eklenmeden önce haber işi iki ülkeyi de deneyip
         * *"biri tutarsa kapsanmış say"* diyordu — ölçüldü (09.08): kod tablosundaki 610 kod iki
         * ülkeye birden çözülüyor, yani Fransa'da açılan bir bölge aynı kodu yazmış Alman müşteriye
         * gidebilirdi. Yanlış gönderim geri alınamaz (damga yazılır, satır bir daha görünmez).
         *
         * Tüm kayıtlar FR olsaydı ayrımın çalıştığı hiçbir koşuda görülmezdi.
         */
        filtre: (q) => q.eq('country', 'DE'),
      },
      // 14.10 dil kolonu: dolu ve BOŞ hâli birlikte — boşta haber işi profile, sonra fr'ye düşer.
      { ad: 'dili kayıtlı', zorunlu: true, filtre: (q) => q.not('locale', 'is', null) },
      { ad: 'dili bilinmiyor', zorunlu: true, filtre: (q) => q.is('locale', null) },
      // Yüzey izi: hepsi 'web' olsaydı native uygulamadan gelen kaydın hiç örneği olmazdı.
      { ad: 'native uygulamadan gelen', zorunlu: true, filtre: (q) => q.neq('source', 'web') },
      { ad: 'yer adı çözülememiş', filtre: (q) => q.is('place_name', null) },
    ],
  },
  {
    baslik: 'Sayfa görselleri',
    tablo: 'site_image',
    kovalar: [
      {
        ad: 'dolu slot',
        zorunlu: true,
        // Kova R2 ayarına da bağlı: anahtar yüklenemezse seed slotu boş bırakır (graceful). Boş
        // kalması bir seed kusurundan çok bir ortam eksiğini gösterir — ikisi de görülmeli.
        filtre: (q) => q.eq('slot', 'home_hero'),
      },
      {
        ad: 'BOŞ slot (yer tutucu yolu)',
        zorunlu: true,
        /**
         * Dört slotun hepsi dolsaydı **yer tutucu dalı hiç koşmazdı**: ekranların boş çerçeve
         * çizimi, operasyonun "bu slot henüz boş" satırı ve kova erişilemediğinde kırılmama
         * davranışı yerelde hiç görülmezdi. Kova "en az bir slot boş mu" diye sorar.
         */
        sayac: async (db) => {
          const { data } = await db.from('site_image').select('slot');
          const dolu = new Set(((data ?? []) as unknown as { slot: string }[]).map((r) => r.slot));
          return ['home_hero', 'packages_hero', 'professionals_hero', 'empty_cart'].filter((s) => !dolu.has(s)).length;
        },
      },
    ],
  },
  {
    baslik: 'Konuşma',
    kovalar: [
      {
        ad: 'mesajları ayrık damgalı',
        zorunlu: true,
        /**
         * **Sohbet bir ZAMAN DİZİSİDİR** — mesajları aynı damgayı taşıyan konuşma, gerçekte
         * olmayan bir hâldir ve iki şeyi birden sınanamaz kılar (ölçüldü 09.08):
         *   · ekran "önce/sonra" ayrımını gösteremez,
         *   · `created_at` üzerindeki keyset sayfalamanın YÖNÜ doğrulanamaz — `listPage` (eskiden
         *     yeniye) ile `listRecent` (yeniden eskiye) aynı satırları aynı sırada döndürür.
         *     Sıralama bozuk olduğu için değil, veri ayırt edilemez olduğu için.
         *
         * Kova "en az bir konuşmanın mesajları farklı damgalı mı" diye sorar.
         */
        sayac: async (db) => {
          const { data } = await db.from('message').select('conversation_id,created_at');
          const damgalar = new Map<string, Set<string>>();
          for (const r of (data ?? []) as unknown as { conversation_id: string; created_at: string }[]) {
            if (!damgalar.has(r.conversation_id)) damgalar.set(r.conversation_id, new Set());
            damgalar.get(r.conversation_id)!.add(r.created_at);
          }
          return [...damgalar.values()].filter((s) => s.size > 1).length;
        },
      },
      { ad: 'cevap bekleyen', zorunlu: true, sayac: (db) => say(db, 'conversation_inbox', (q) => q.eq('awaiting_reply', true)) },
      { ad: 'giden mesaj', zorunlu: true, sayac: (db) => say(db, 'message', (q) => q.eq('direction', 'outbound')) },
      { ad: 'gelen mesaj', zorunlu: true, sayac: (db) => say(db, 'message', (q) => q.eq('direction', 'inbound')) },
    ],
  },
  {
    baslik: 'Sipariş — yol ve kanal',
    tablo: 'order',
    siparisGerektirir: true,
    kovalar: [
      { ad: 'rota', zorunlu: true, filtre: (q) => q.eq('delivery_type', 'route') },
      { ad: 'kargo', zorunlu: true, filtre: (q) => q.eq('delivery_type', 'shipping') },
      { ad: 'b2c', zorunlu: true, filtre: (q) => q.eq('channel', 'b2c') },
      { ad: 'b2b', zorunlu: true, filtre: (q) => q.eq('channel', 'b2b') },
      { ad: 'vadeli', zorunlu: true, filtre: (q) => q.eq('on_account', true) },
    ],
  },
  {
    // SEFER (0046 · 18.08): üç ekranın verisi — kurye rota seçimi, sevkiyat sefer şeridi, geçmiş
    // seferler sekmesi. Kapanışın üç hâli (mutabık · farklı · sayılmamış) ekranda üç ayrı görünüm.
    baslik: 'Sefer (delivery_run)',
    tablo: 'delivery_run',
    siparisGerektirir: true,
    kovalar: [
      { ad: 'sefer', zorunlu: true, sayac: (db) => say(db, 'delivery_run', (q) => q) },
      { ad: 'sefere damgalı sipariş', zorunlu: true, sayac: (db) => say(db, 'order', (q) => q.not('delivery_run_id', 'is', null)) },
      { ad: 'mutabık kapanış', zorunlu: true, sayac: (db) => say(db, 'delivery_run_close', (q) => q.eq('reconciled', true)) },
      { ad: 'FARKLI kapanış', zorunlu: true, sayac: (db) => say(db, 'delivery_run_close', (q) => q.eq('reconciled', false)) },
      { ad: 'sayılmamış (açık) sefer', zorunlu: true, sayac: sayilmamisSefer },
      /*
        BUGÜNE ait iki hâl (30.08) — para ekranlarının GÜN ölçütü buna bakıyor: gün sonu
        mutabakatı yalnız bugünün kapanışlarını okuyor (`readMoneyDayEnd`), kuryenin üstündeki
        para ise yalnız bugünün KAPANMAMIŞ seferlerinden türüyor (`readMoneyOverview`).

        ── AÇIK SEFER ZORUNLUDAN ÇIKTI (kullanıcı kararı 31.08) ─────────────────────────────
        Kullanıcı seed'in bugünü SIFIRDAN bırakmasını istedi: *"kurye ekranı açıldığı zaman
        sahiplenilmiş bir rota ortaya çıkmasın."* Seed bugünün rotasını kurup sürüyordu ve kurye
        ekranı açılır açılmaz durak listesine düşüyordu — akışın ilk dört adımı (rehber · sefer
        ve araç seçimi · yükleme · sefer başlatma) hiç denenemiyordu.

        Kova bu yüzden boş kalıyor ve boş kalması BİR EKSİK DEĞİL: açık sefer yoksa kuryenin
        üstünde para da yoktur. `readMoneyOverview`ın o satırı sıfır gösterir ve sıfır burada
        DOĞRUDUR — "ölçülemedi" değil, "kurye henüz yola çıkmadı". Hâl yine üretilebiliyor,
        yalnız seed'in değil AKIŞIN eliyle: kurye seferi başlattığı anda doğuyor.

        `zorunlu` KALDIRILMADI, `false`a çekildi: kova hâlâ RAPORLANIYOR — dolduğunda görünsün,
        boşken de ekranın hangi hâlinin sınanmadığı yazılı kalsın.
      */
      { ad: 'bugüne ait açık sefer', zorunlu: false, sayac: (db) => bugunSeferleri(db, false) },
      /* Kapanış ZORUNLU KALIYOR: seed bugünün BİTMİŞ gününü (bütün durakları sonuçlanmış grup)
         yine kuruyor ve kapatıyor — gün sonu mutabakatının bugüne ait tek kaynağı o. */
      { ad: 'bugüne ait kapanış', zorunlu: true, sayac: (db) => bugunSeferleri(db, true) },
    ],
  },
  {
    /*
      EKSİK TOPLAMA (Y2 · 30.08) — yönetimin "sipariş istisnaları" ekranı ve hub'ın karar kutusu.

      **KOVA MOTORU ÇAĞIRIR, KURALI KOPYALAMAZ.** İstisna saklanmıyor, TÜRETİLİYOR: raftaki gerçeğin
      karşılayamadığı kalem (`shortfallQty > 0`) VE müşteriye henüz sorulmamış olan
      (`!awaitingAnswer`). İkinci koşulu ham SQL'e kopyalamak kuralı ikinci bir yerde yaşatmak
      olurdu — ve tam da o koşul yüzünden ekran bir kez sessizce boş kaldı: seed'in eksik kalemi,
      seed'in TALEBİ ile çakışmış, kalem "soruldu" sayılıp kuyruktan düşmüştü. Sayı bu yüzden
      ekranın okuduğu fonksiyonun kendisinden geliyor; çakışma tekrarlarsa kova kırmızı döner.
    */
    baslik: 'Sipariş istisnası (eksik toplama)',
    siparisGerektirir: true,
    kovalar: [{ ad: 'karar bekleyen istisna', zorunlu: true, sayac: eksikToplamaSay }],
  },
  {
    /*
      PARA — BUGÜNÜN DEFTERİ (30.08). Para bölümünün iki ekranı da "bugün" ölçütüyle okuyor ve
      seed'in bütün tahsilatları dün tarihliydi: ekranlar boş değil YANLIŞ doluyordu ("bugün hiç
      para girmedi"). Kovalar o günü savunuyor — yöntem kırılımı üç sütunlu olduğu için üç yöntem
      ayrı ayrı sorulur, tek yöntemli bir gün kırılımı hiç göstermez.
    */
    baslik: 'Para — bugünün defteri',
    tablo: 'money_movement',
    /* Beşinci kova (`eşleşmemiş hareket`) siparişsiz de doluyor — gider hareketleri var. Ama alan
       bir bütün olarak işaretleniyor: dört tahsilat kovasının dördü de siparişe bağlı ve ekranın
       gün kırılımı ancak onlarla anlamlı. */
    siparisGerektirir: true,
    kovalar: [
      { ad: 'bugün sipariş tahsilatı', zorunlu: true, sayac: (db) => say(db, 'money_movement', (q) => q.eq('value_date', bugun()).eq('type', 'order_payment')) },
      { ad: 'bugün NAKİT tahsilat', zorunlu: true, sayac: (db) => bugunYontemliTahsilat(db, 'cash') },
      { ad: 'bugün KART tahsilat', zorunlu: true, sayac: (db) => bugunYontemliTahsilat(db, 'card') },
      { ad: 'bugün ÇEK tahsilat', zorunlu: true, sayac: (db) => bugunYontemliTahsilat(db, 'cheque') },
      { ad: 'eşleşmemiş hareket', zorunlu: true, sayac: (db) => say(db, 'money_movement', (q) => q.eq('reconciled', false)) },
    ],
  },
  {
    // ASİSTAN KUYRUĞU (Modül 22 · 26.08): onbir öneri tipinin HER BİRİNİN kendi gövdesi var ve
    // gövde ancak o tipten bir dilekçe kuyruktayken ekranda açılabiliyor. Kova sayısı onbirin
    // altına düşerse bir gövde gözle hiç sınanamaz — modülün ekran doğrulamaları tam bu yüzden
    // aylarca takılı kaldı (kuyruk her `db:refresh`te boşalıyordu).
    //
    // Karar geçmişi de zorunlu: kuyruğun üç sekmesinden ikisi ona bağlı ve iki davranış yalnız
    // orada görünür — karar verilmiş öneride formun KİLİTLİ çizilmesi (22.19) ve tip süzgecinin
    // geçmiş üzerinde çalışması (22.37).
    baslik: 'Asistan onay kuyruğu (assistant_proposal)',
    tablo: 'assistant_proposal',
    kovalar: [
      { ad: 'bekleyen dilekçe', zorunlu: true, filtre: (q) => q.eq('status', 'pending') },
      { ad: 'onaylanmış', zorunlu: true, filtre: (q) => q.eq('status', 'applied') },
      { ad: 'reddedilmiş', zorunlu: true, filtre: (q) => q.eq('status', 'rejected') },
      { ad: 'süresi dolmuş', zorunlu: true, filtre: (q) => q.eq('status', 'expired') },
      { ad: 'ONBİR tipin hepsi kuyrukta', zorunlu: true, sayac: tumTiplerKuyrukta },
    ],
  },
  {
    // ── KDV DOĞRULAMASININ YAŞI (27.08) ──────────────────────────────────────────────────────
    // Onay kartı bu bayrağın yaşını üç ayrı hâlde çiziyor ve **hiçbiri koddan uydurulamıyor** —
    // veriden geliyor. Kovalar bu yüzden zorunlu: yaş ayrımı yazıldığı gün seed'de yalnız "taze"
    // hâli vardı, yani "bayat" rozeti hiçbir ekranda görülemezdi.
    //
    // Ayrımın bedeli kartta değil vergide: bayrak ters yükümlülüğü (%0 KDV) açıyor
    // (`domain-core/tax/vat-treatment`), yani bayat bir "Geçerli" bir vergi hatasıdır.
    baslik: 'B2B — KDV doğrulamasının yaşı (user_profiles)',
    tablo: 'user_profiles',
    kovalar: [
      {
        ad: 'TAZE doğrulama (30 gün içinde)',
        zorunlu: true,
        filtre: (q) => q.eq('vat_number_valid', true).gt('vat_number_checked_at', gunOnce(30)),
      },
      {
        ad: 'BAYAT doğrulama (30 günden eski)',
        zorunlu: true,
        filtre: (q) => q.eq('vat_number_valid', true).lt('vat_number_checked_at', gunOnce(30)),
      },
      {
        // Numarası var ama VIES cevap vermemiş: Fransa'nın düğümü sık sık meşgul (ölçüldü 27.08),
        // yani bu hâl istisna değil GÜNLÜK — kartın en sık çizeceği KDV satırı bu.
        ad: 'SORULMAMIŞ (numara var, cevap yok)',
        zorunlu: true,
        filtre: (q) => q.not('vat_number', 'is', null).is('vat_number_valid', null),
      },
    ],
  },
];

/**
 * Bekleyen dilekçelerin kaç FARKLI tip taşıdığı — onbir beklenir (`AssistantProposalKindEnum`).
 *
 * Sayı değil KAPSAM ölçüyor: elli dilekçe olsa ama hepsi aynı tipten olsa öteki on gövde yine
 * ekranda açılamazdı. Eksik tipler adlarıyla basılır, çünkü "10/11" görüp hangisinin eksik
 * olduğunu aramak teşhisi uzatır.
 */
async function tumTiplerKuyrukta(db: Db): Promise<number> {
  const { data, error } = await db.from('assistant_proposal').select('kind').eq('status', 'pending');
  if (error) throw error;
  const tipler = new Set((data ?? []).map((r) => r.kind as string));
  const eksik = AssistantProposalKindEnum.options.filter((k) => !tipler.has(k));
  if (eksik.length > 0) console.warn(`    ⚠ kuyrukta olmayan tip: ${eksik.join(' · ')}`);
  return tipler.size >= AssistantProposalKindEnum.options.length ? tipler.size : 0;
}

/** Kapanışı olmayan sefer — anti-join'i iki sorguyla kurar (PostgREST tek sorguda "not exists" bilmez). */
async function sayilmamisSefer(db: Db): Promise<number> {
  const { data, error } = await db.from('delivery_run_close').select('delivery_run_id');
  if (error) throw error;
  const closed = new Set((data ?? []).map((row) => row.delivery_run_id as string));
  const { data: runs, error: runErr } = await db.from('delivery_run').select('id');
  if (runErr) throw runErr;
  return (runs ?? []).filter((row) => !closed.has(row.id as string)).length;
}

/**
 * BUGÜNÜN seferleri, kapanış durumuna göre (30.08). Anti-join `sayilmamisSefer` ile aynı desende
 * ama gün süzgeçli: para ekranlarının ölçütü GÜNDÜR, "hiç var mı" değil.
 */
async function bugunSeferleri(db: Db, kapali: boolean): Promise<number> {
  const { data: runs, error: runErr } = await db.from('delivery_run').select('id').eq('delivery_date', bugun());
  if (runErr) throw runErr;
  const idler = (runs ?? []).map((row) => row.id as string);
  if (idler.length === 0) return 0;
  const { data, error } = await db.from('delivery_run_close').select('delivery_run_id');
  if (error) throw error;
  const closed = new Set((data ?? []).map((row) => row.delivery_run_id as string));
  return idler.filter((id) => closed.has(id) === kapali).length;
}
/**
 * Bugün deftere giren sipariş tahsilatı, YÖNTEME göre.
 *
 * Yöntem hareketin kendisinde YOK, siparişindedir (hareket hesabı taşır) — para ekranının okuması
 * da tam olarak bu zinciri kuruyor (`readMoneyOverview`). Kova aynı zinciri sorar; başka türlü
 * "kırılım dolu" iddiası ölçülemez.
 */
async function bugunYontemliTahsilat(db: Db, yontem: 'cash' | 'card' | 'cheque'): Promise<number> {
  const { data, error } = await db
    .from('money_movement')
    .select('order_id')
    .eq('value_date', bugun())
    .eq('type', 'order_payment')
    .not('order_id', 'is', null);
  if (error) throw error;
  const idler = [...new Set((data ?? []).map((row) => row.order_id as string))];
  if (idler.length === 0) return 0;
  const { data: siparisler, error: siparisHata } = await db
    .from('order')
    .select('id')
    .in('id', idler)
    .eq('payment_method', yontem);
  if (siparisHata) throw siparisHata;
  return (siparisler ?? []).length;
}

/**
 * Karar bekleyen sipariş istisnası — ekranın OKUDUĞU motorun kendisiyle sayılır.
 *
 * Kapsam da ekranınkiyle aynı kurulur (aktif TESİSLER — `management.ts` `activeFacilityIds`):
 * başka bir küme sorulsaydı kova yeşil, ekran boş olabilirdi.
 */
async function eksikToplamaSay(db: Db): Promise<number> {
  const { data, error } = await db.from('warehouse').select('id').eq('is_active', true).eq('kind', 'facility');
  if (error) throw new Error(`[kapsam] warehouse: ${error.message}`);
  const warehouseIds = ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
  return (await listOrderExceptions(db, { warehouseIds })).length;
}

/** Sipariş DURUMLARI ayrı: kova listesi enum'dan gelmeli, elle yazılan liste enum büyüyünce eskir. */
const SIPARIS_DURUMLARI = [
  'draft', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'completed', 'cancelled', 'returned',
] as const;

interface KapsamSonucu {
  satirlar: { alan: string; kova: string; sayi: number; zorunlu: boolean }[];
  bosZorunlular: { alan: string; kova: string }[];
  kdvOranlari: unknown[];
}

export async function kapsamOl(db: Db): Promise<KapsamSonucu> {
  const satirlar: KapsamSonucu['satirlar'] = [];
  const bosZorunlular: KapsamSonucu['bosZorunlular'] = [];

  for (const alan of KAPSAM) {
    // Sipariş isteyen alanın kovaları raporlanır ama kapıyı kapatmaz (künye `KapsamAlani`).
    const zorunluMu = (kova: KapsamKovasi): boolean => kova.zorunlu === true && alan.siparisGerektirir !== true;
    for (const kova of alan.kovalar) {
      const sayi = kova.sayac ? await kova.sayac(db) : await say(db, alan.tablo!, kova.filtre);
      satirlar.push({ alan: alan.baslik, kova: kova.ad, sayi, zorunlu: zorunluMu(kova) });
      if (zorunluMu(kova) && sayi === 0) bosZorunlular.push({ alan: alan.baslik, kova: kova.ad });
    }
  }

  /*
    Sipariş durumları — dokuzunun da örneği OLMALIYDI: her biri ayrı bir ekran hâli ve ayrı geçiş.
    Besleme 01.09'dan beri hiç sipariş yazmıyor, dolayısıyla dokuzu da boş; satırlar raporda
    kalıyor (hangi hâllerin sınanmadığı yazılı kalsın) ama zorunlu DEĞİL.
  */
  for (const durum of SIPARIS_DURUMLARI) {
    const sayi = await say(db, 'order', (q) => q.eq('status', durum));
    satirlar.push({ alan: 'Sipariş — durum', kova: durum, sayi, zorunlu: false });
  }

  return { satirlar, bosZorunlular, kdvOranlari: await degerler(db, 'product', 'vat_rate') };
}
