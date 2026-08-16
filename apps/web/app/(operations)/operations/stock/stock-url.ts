// Stok ekranının URL SÖZLEŞMESİ — tek kaynak (ürünler ekranının deseni). Sekme ve süzgeçler adreste
// taşınır: yenilemede aynı görünüm açılır ve SUNUCU okuyabildiği için süzme sunucuda yapılır.
//
// İmleç adrese YAZILMAZ (CLAUDE.md §1): paylaşılan link listenin ortasından başlamamalı.

// Yol sabiti dışa VERİLMEZ: teklif eylemi `lib/stock/offer-actions`'a taşınınca tek tüketicisi
// kalmadı; adres burada, `stockUrl()` içinde yaşıyor.
import { WAREHOUSE_PARAM } from '@/lib/warehouse/filter';
import { one, oneOf, type RawParams } from '@/lib/url-params';

const STOCK_PATH = '/operations/stock';

/**
 * **DÖRT SEKME — depo yüzeyinin tamamı tek sayfada** (22.26).
 *
 * Mal kabul (`/operations/receiving`) ve stoktan düş (`/operations/adjustments`) ayrı sayfalardı;
 * tasarımın 01.08 kararı ikisini de buraya alıyordu ve gerekçesi paranın emsalidir: *"kasa hareketi
 * ile banka hareketi aynı şeydir, yalnız hesabı farklı"* (`DOMAIN §7`). Stokta karşılığı: mal girer,
 * durur, çıkar — üçü tek stoğun üç anıdır. Ayrı sayfalar "bu depoya ne girdi" sorusunun cevabını
 * bölüyordu.
 *
 * Sayfaların ayrı doğmasının sebebi düşmüş bir varsayımdı: *form depocunun telefonunda, kayıt
 * yöneticinin masaüstünde*. 06.08'de operasyon web'i masaüstü-yalnız oldu (telefon native
 * uygulamanın), yani ayrımın dayanağı kalmadı.
 *
 * `losses` → `outgoing`: sekme artık yalnız imhayı değil çıkan malın tamamını adlandırıyor.
 */
export const STOCK_TABS = ['levels', 'attention', 'intake', 'outgoing'] as const;
export type StockTab = (typeof STOCK_TABS)[number];

// Sekme ADLARI kimliklerin yanında (15.08, emsal: ürünler): desktop `'use client'` olduğundan
// sunucuda çizilen `loading.tsx` oradan okuyamıyordu ve iskelet 3 çubukta kalmıştı — dördüncü
// sekme ("Çıkışlar") gelince bar genişliyordu. Ad ile kimlik aynı dosyada durunca sekme eklemek
// ikisini birden günceller.
export const STOCK_TAB_LABEL: Record<StockTab, string> = {
  levels: 'Stok seviyeleri',
  attention: 'Yaklaşan tarihli',
  intake: 'Mal kabul',
  outgoing: 'Çıkışlar',
};

/**
 * Parti süzgeci — "hangi partiler görünsün".
 *  · `all`     → hepsi
 *  · `expiry`  → karar bekleyenler (yaklaşan tarihli · DDM geçmiş · imhalık)
 *  · `offer`   → teklifi açık olanlar
 *
 * ("eşik altı" bir süre dördüncü çip olarak duruyordu — tasarımda yok, kaldırıldı. Satırda `belowMin`
 * göstergesi yerinde: bilgi kayboldu değil, süzgeç olmaktan çıktı.)
 *
 * Süzgeç PARTİ üstünden tanımlı ama SATIR süzer: bir boyun partilerinden biri ölçüte uyuyorsa satır
 * kalır. "Yaklaşan tarihli üründe başka sağlam parti de var" bilgisi karar için gereklidir; satırı
 * yalnız uyan partiyle göstermek, elde duran sağlam malı gizlerdi.
 */
export const STOCK_SCOPES = ['all', 'expiry', 'offer'] as const;
export type StockScope = (typeof STOCK_SCOPES)[number];

/**
 * Çıkışlar sekmesinin DÖNEMİ. Hareket kaydı zamanla sınırsız büyür; "ne kadar çöpe gitti" sorusunun
 * cevabı ancak bir dönemle anlamlıdır. Varsayılan çeyrek: aylık dalgalanmayı yutacak kadar geniş,
 * mevsim değişimini gizlemeyecek kadar dar.
 *
 * `all` iki ucu da açık bırakır ve toplam okuması geçmişle büyür — bilinçli bir seçenek, varsayılan değil.
 */
export const LOSS_PERIODS = ['month', 'days30', 'quarter', 'all'] as const;
export type LossPeriod = (typeof LOSS_PERIODS)[number];

export interface StockUrlState {
  tab: StockTab;
  /** Ürün/boy araması (boş = yok). */
  q: string;
  /** Kategori id'si ya da 'all'. */
  cat: string;
  scope: StockScope;
  period: LossPeriod;
  /**
   * Depo süzgeci — depo KODU (`STR`); boş = süzgeç yok (19.5). Adreste taşınır çünkü paylaşılabilir
   * bir BAKIŞTIR; depo bağlamı ise çerezdedir ve adrese yazılmaz.
   */
  depo: string;
  /**
   * SEÇİLİ boy (`v=<variantId>`, 16.08 — talepler ekranının `?t=` deseni): sağdaki geçmiş panelinin
   * bağlantısı paylaşılabilmeli, yenilemede seçim kaybolmamalı. Süzgeç DEĞİL — liste daralmaz;
   * yazımı SIĞDIR (`replaceState`): panel kendi verisini zaten action ile çekiyor.
   */
  selected: string;
}

const DEFAULTS: StockUrlState = { tab: 'levels', q: '', cat: 'all', scope: 'all', period: 'quarter', depo: '', selected: '' };

/** URL → ekran durumu. Tanınmayan değer sessizce varsayılana düşer (bozuk link ekranı kırmaz). */
export function parseStockUrl(params: RawParams): StockUrlState {
  return {
    tab: oneOf(params.tab, STOCK_TABS, DEFAULTS.tab),
    q: one(params.q).trim(),
    cat: one(params.cat) || DEFAULTS.cat,
    scope: oneOf(params.scope, STOCK_SCOPES, DEFAULTS.scope),
    period: oneOf(params.period, LOSS_PERIODS, DEFAULTS.period),
    // Kod burada DOĞRULANMAZ, normalize edilir: "bu kod benim evrenimde var mı" bağlamın sorusudur.
    depo: one(params[WAREHOUSE_PARAM]).trim().toUpperCase(),
    selected: one(params.v).trim(),
  };
}

/** Ekran durumu → URL. Varsayılanlar YAZILMAZ (temiz adres); sıra sabit (aynı görünüm = aynı adres). */
export function stockUrl(state: StockUrlState): string {
  const p = new URLSearchParams();
  if (state.tab !== DEFAULTS.tab) p.set('tab', state.tab);
  if (state.q) p.set('q', state.q);
  if (state.cat !== DEFAULTS.cat) p.set('cat', state.cat);
  if (state.scope !== DEFAULTS.scope) p.set('scope', state.scope);
  if (state.period !== DEFAULTS.period) p.set('period', state.period);
  if (state.depo) p.set(WAREHOUSE_PARAM, state.depo);
  if (state.selected) p.set('v', state.selected);
  const qs = p.toString();
  return qs ? `${STOCK_PATH}?${qs}` : STOCK_PATH;
}

/**
 * BAŞKA bir ekrandan Stok'a bağlantı — varsayılanların üstüne yalnız istenen alanlar konur.
 *
 * Depolar ekranının karnesi buraya bağlanıyor ("6 varyant eşik altı" → Stok, bağlam bu depoda) ve
 * adresi elle kurmak (`?depo=STR&scope=expiry`) parametre adlarını ikinci kez yazmak olurdu: bu
 * dosyanın kendi başlığı "URL SÖZLEŞMESİ — tek kaynak" diyor, dışarıdan gelen bağlantı da o
 * sözleşmeden geçmeli.
 */
export function stockLink(patch: Partial<StockUrlState> = {}): string {
  return stockUrl({ ...DEFAULTS, ...patch });
}

/**
 * SERVİS süzgeçleri — yalnız sunucunun uygulayabileceği olanlar. `scope` burada YOK ve bu bilinçli:
 * "yaklaşan tarihli" bir raf ömrü KARARIDIR (motorun işi), veritabanı süzgeci değil. Ölçütü SQL'e
 * kopyalamak, eşiği iki yerde tutmak demekti — biri değişince ekran ile sayaç ayrışırdı.
 */
export function toStockFilters(state: StockUrlState): { categoryId?: string; query?: string } {
  /**
   * **`q` ARTIK SEKMEYE GÖRE** (22.31, kullanıcı tespiti: *"bu bölümde ürünü arama yok"*).
   *
   * Eskiden hiç geçmiyordu ve gerekçesi doğruydu: arama yalnız Çıkışlar sekmesinde vardı, orada
   * yüklenmiş satırlarda çalışıyor ve terimi ürün sorgusuna vermek, kutuya yazılan kelimenin
   * GÖRÜNMEYEN bir listeyi süzmesi olurdu.
   *
   * Seviyeler sekmesine kendi araması gelince koşul değişti: orada terim tam da ürün sorgusuna
   * aittir ve sunucuda süzülmelidir — liste keyset sayfalı, istemcide süzmek yalnız yüklenmiş ilk
   * sayfayı daraltır ve operatör "aradığım ürün yok" sanır.
   */
  return {
    categoryId: state.cat === 'all' ? undefined : state.cat,
    query: state.tab === 'levels' && state.q ? state.q : undefined,
  };
}

/**
 * Dönemin başlangıcı — `undefined` sınırsız ("Tümü"). Sunucuda hesaplanır ki liste ile toplam AYNI
 * aralığı görsün; iki yerde hesaplansaydı gece yarısını geçen bir istekte tablo ile toplam ayrışırdı.
 */
export function periodStart(period: LossPeriod, now: Date): Date | undefined {
  if (period === 'all') return undefined;
  if (period === 'days30') return new Date(now.getTime() - 30 * 86_400_000);
  if (period === 'month') return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return new Date(Date.UTC(now.getUTCFullYear(), Math.floor(now.getUTCMonth() / 3) * 3, 1));
}

/** Dönemin operatöre görünen adı — toplamın yanında "neyin toplamı" yazsın diye. */
export const PERIOD_LABEL: Record<LossPeriod, string> = {
  month: 'Bu ay',
  days30: '30 gün',
  quarter: 'Bu çeyrek',
  all: 'Tümü',
};
