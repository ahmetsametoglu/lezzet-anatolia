import type { ReactNode } from 'react';
import { resolveLocalizedText } from '@lezzet/types';
import { money, num, shortDate } from './format';

/**
 * DİLEKÇENİN OKUNUR HÂLİ — ham `payload`ı çeviren tek bileşen (22.15).
 *
 * ── NEDEN GENEL, TİP BAŞINA DEĞİL ───────────────────────────────────────────
 * Kullanıcı kararı (11.08): *"ajandan gelen bilginin en sağda bir sütun şeklinde özeti olsun. Düz
 * metin değil. JSON'ın daha okunabilir şekilde çevrilmiş hâli. Bu tüm öneri diyaloglarında standart
 * olacak."*
 *
 * Tip başına elle künye listesi yazmak iki şeyi birden bozuyordu: (1) on bir tipte on bir ayrı
 * "hangi alanları göstereyim" kararı — biri mutlaka eksik kalır; (2) şemaya yeni bir alan eklenince
 * o alan sessizce görünmez olur. 22.12'de tam bu yüzden on iki alan açıldı ve hiçbiri kendiliğinden
 * ekrana çıkmadı. Buradaki çeviri payload'ın KENDİSİNİ geziyor: alan eklenince ekranda belirir.
 *
 * ── ÇEVİRİ, DÖKÜM DEĞİL ─────────────────────────────────────────────────────
 * Ham JSON basmak da bir "standart" olurdu ama okunmazdı. Üç şey yapılıyor:
 * · **Alan adı** sözlükten Türkçeye çevrilir; sözlükte yoksa anahtar okunur hâle getirilir.
 * · **Değer** tipine göre biçimlenir — para cent'ten euro'ya, ISO tarih kısa tarihe, çok dilli metin
 *   dolu dilleriyle, boolean evet/hayıra.
 * · **Kimlik GİZLENİR.** `…Id` alanları hiç yazılmaz: uuid okunmaz ve yanındaki `…Name` zaten aynı
 *   şeyi söyler. Bir kimliğin tek başına durduğu yerde (ad alanı yoksa) kısaltılmış hâli yazılır ki
 *   satır sessizce kaybolmasın.
 *
 * ── EKSİK ALAN DA GÖSTERİLİR ────────────────────────────────────────────────
 * `null` ve boş dizi satırdan DÜŞMEZ, "—" olarak yazılır (22.10 ilkesi): verilmemiş bir kararı
 * gizlemek, onu verilmiş gibi göstermektir. Kullanıcının ilk sorusu tam buydu — *"asgari sepete hiç
 * girmemiş, acaba haberi var mıydı?"*
 */

/** Alan adlarının okunur karşılığı — sözlükte olmayan anahtar kelimelere ayrılıp yazılır. */
const FIELD_LABEL: Record<string, string> = {
  // ortak
  name: 'Ad',
  description: 'Açıklama',
  reason: 'Gerekçe',
  note: 'Not',
  category: 'Kategori',
  categoryName: 'Kategori',
  scopeName: 'Kapsam',
  warehouseCode: 'Depo',
  supplierName: 'Tedarikçi',
  accountName: 'Hesap',
  counterAccountName: 'Hedef hesap',
  counterpartyName: 'Karşı taraf',
  productName: 'Ürün',
  zoneName: 'Bölge',
  country: 'Ülke',
  qty: 'Adet',
  lines: 'Kalemler',
  items: 'Kalemler',
  // ürün / beyan
  ingredients: 'İçindekiler',
  storageInstructions: 'Saklama',
  nutrition: 'Besin künyesi',
  allergens: 'Alerjenler',
  traces: 'İzler',
  dateType: 'Tarih tipi',
  shelfLifeDays: 'Raf ömrü (gün)',
  vatRate: 'KDV (%)',
  shippable: 'Kargo izni',
  variants: 'Boylar',
  label: 'Etiket',
  netWeightG: 'Net ağırlık (g)',
  piecesCount: 'Adet (paket içi)',
  fields: 'Yazılacak alanlar',
  currentFields: 'Bugünkü hâli',
  uncertainFields: 'Net okunmayan',
  remainingGaps: 'Onay sonrası eksik',
  // fiyat / para
  offerPriceCents: 'Teklif fiyatı',
  listPriceCents: 'Liste fiyatı',
  amountCents: 'Tutar',
  totalAmountCents: 'Fatura toplamı',
  unitCostCents: 'Birim alış',
  lastPurchasePriceCents: 'Son alış',
  minBasketCents: 'Asgari sepet',
  totalPrice: 'Paket fiyatı',
  allocatedUnitPrice: 'Kaleme düşen',
  percent: 'Oran (%)',
  direction: 'Yön',
  type: 'Tür',
  publicLabel: 'Müşteri metni',
  code: 'Kupon kodu',
  trigger: 'Tetik',
  scope: 'Kapsam türü',
  firstOrderOnly: 'Yalnız ilk sipariş',
  maxUses: 'Kullanım tavanı',
  perCustomerLimit: 'Kişi başı tavan',
  validFrom: 'Başlangıç',
  validTo: 'Bitiş',
  valueDate: 'Değer tarihi',
  // stok / tedarik
  expiryDate: 'SKT',
  lotNumber: 'Lot',
  physicalQty: 'Partide',
  documentNo: 'Belge no',
  date: 'Belge tarihi',
  purchaseOrderId: 'Bağlı sipariş',
  postalCodes: 'Posta kodları',
  postalCode: 'Kod',
  placeName: 'Yer',
  requestCount: 'Talep',
  waitingCount: 'Bekleyen',
  // vitrin / tarif
  target: 'Hedef türü',
  isFeatured: 'Vitrine',
  currentlyFeaturedCount: 'Vitrinde',
  steps: 'Hazırlanış',
  serves: 'Porsiyon',
  duration: 'Süre',
  meal: 'Öğün',
  pantry: 'Evinizden',
};

/** Değeri okunur bir metne çevirir; `null` dönerse satır iç içe yapı olarak çizilir. */
function formatScalar(key: string, value: unknown): string | null {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'evet' : 'hayır';

  if (typeof value === 'number') {
    // Para alanları adından tanınır (`STACK §8` — cent tek birim). Oran ve sayaçlar ham kalır.
    if (/Cents$/.test(key)) return money(value);
    return num(value);
  }

  if (typeof value === 'string') {
    if (!value.trim()) return '—';
    // ISO tarih (YYYY-AA-GG ya da damga) kısa tarihe; ötekiler olduğu gibi.
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return shortDate(value);
    return clamp(value);
  }

  return null;
}

/**
 * Uzun metni sütuna sığdırır — dilekçe sütunu dar ve tek bir açıklama onu boydan boya kaydırırdı.
 *
 * Kesme noktası cömert (90 karakter): asıl soru "ne yazılmış", tam metin zaten formun kutusunda ve
 * satırın `title` ipucunda duruyor.
 */
function clamp(text: string): string {
  const t = text.trim();
  return t.length > 90 ? `${t.slice(0, 90)}…` : t;
}

/** Çok dilli metin mi — öyleyse dolu dilleri ayrı satırlarda gösterilir. */
function isLocalized(value: object): boolean {
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((k) => ['tr', 'fr', 'de'].includes(k));
}

interface TreeRow {
  key: string;
  label: string;
  value: string | null;
  depth: number;
  /** Kısaltılmışsa metnin tamamı — satırın ipucunda okunur. */
  full?: string;
  /** Alt satırlar (nesne/dizi açılımı). */
  children?: TreeRow[];
}

/** Anahtarı okunur bir başlığa çevirir — sözlükte yoksa camelCase ayrılır. */
function labelOf(key: string): string {
  if (FIELD_LABEL[key]) return FIELD_LABEL[key];
  const spaced = key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function buildRows(value: unknown, depth: number, keyPrefix: string): TreeRow[] {
  if (value === null || typeof value !== 'object') return [];
  if (Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, raw]): TreeRow[] => {
    // Kimlik satırları GİZLİ: uuid okunmaz ve yanındaki ad alanı aynı şeyi söyler. Adı olmayan bir
    // kimlik varsa kısaltılıp yazılır — satırın sessizce kaybolması, alanın hiç olmamasından kötü.
    if (/(^id$|Id$)/.test(key)) {
      const twin = key === 'id' ? 'name' : `${key.slice(0, -2)}Name`;
      if (twin in (value as Record<string, unknown>)) return [];
      if (typeof raw === 'string' && raw.length > 12) {
        return [{ key: `${keyPrefix}${key}`, label: labelOf(key), value: `${raw.slice(0, 8)}…`, depth }];
      }
    }

    const id = `${keyPrefix}${key}`;
    const scalar = formatScalar(key, raw);
    if (scalar !== null) {
      return [{ key: id, label: labelOf(key), value: scalar, depth, ...(typeof raw === 'string' ? { full: raw } : {}) }];
    }

    if (Array.isArray(raw)) {
      if (raw.length === 0) return [{ key: id, label: labelOf(key), value: '—', depth }];
      // Kapalı kümeler (alerjen, eksik beyan) tek satırda; nesne dizileri açılır.
      if (raw.every((item) => typeof item === 'string')) {
        return [{ key: id, label: labelOf(key), value: raw.join(' · '), depth }];
      }
      return [
        {
          key: id,
          label: labelOf(key),
          value: `${num(raw.length)} kalem`,
          depth,
          children: raw.flatMap((item, i) => buildRows(item, depth + 1, `${id}.${i}.`)),
        },
      ];
    }

    const obj = raw as Record<string, unknown>;
    if (isLocalized(obj)) {
      const langs = (['tr', 'fr', 'de'] as const).filter((l) => typeof obj[l] === 'string' && (obj[l] as string).trim());
      return [
        {
          key: id,
          label: labelOf(key),
          value: langs.length > 0 ? langs.map((l) => l.toUpperCase()).join(' · ') : '—',
          depth,
          children: langs.map((l) => {
            // Metin KISALTILIR: sütun dar ve uzun bir açıklama tek başına ekranı kaydırır. Burada
            // aranan "metnin tamamı" değil "ne yazılmış" — tamamı zaten formun kutusunda ve
            // kısaltılmış hâlin ipucunda (`title`).
            const text = resolveLocalizedText(obj, l);
            return { key: `${id}.${l}`, label: l.toUpperCase(), value: clamp(text), full: text, depth: depth + 1 };
          }),
        },
      ];
    }

    const children = buildRows(obj, depth + 1, `${id}.`);
    return [{ key: id, label: labelOf(key), value: children.length > 0 ? null : '—', depth, children }];
  });
}

/**
 * Dilekçeyi okunur satırlara çevirip basar.
 *
 * `changed` verilirse o alan SAPMA gösterir: asistanın değeri üstü çizili kalır, operatörünki mor
 * yazılır. Ayrı bir "değişiklikler listesi" kurulmaz — fark, ait olduğu satırın üstünde durur.
 */
export function PayloadTree({ payload, changed }: { payload: unknown; changed?: Record<string, string> }): ReactNode {
  const rows = buildRows(payload, 0, '');
  if (rows.length === 0) return null;
  return (
    <dl className="flex flex-col gap-[3px] font-ops-body text-ops-sm">
      {rows.map((row) => (
        <TreeLine key={row.key} row={row} changed={changed} />
      ))}
    </dl>
  );
}

function TreeLine({ row, changed }: { row: TreeRow; changed?: Record<string, string> }): ReactNode {
  const now = changed?.[row.key];
  const drifted = now !== undefined && now !== row.value;

  return (
    <>
      <div
        className="flex items-baseline justify-between gap-2.5"
        // Girinti derinlikten: iç içe yapı çizgiyle değil boşlukla anlatılıyor — dar sütunda çizgi
        // değerin yerini yiyor.
        style={row.depth > 0 ? { paddingLeft: `${row.depth * 10}px` } : undefined}
      >
        <dt className={`min-w-0 shrink-0 ${row.depth > 0 ? 'text-ops-faint' : 'text-ops-muted'}`}>{row.label}</dt>
        {row.value !== null ? (
          <dd className="flex min-w-0 items-baseline justify-end gap-1.5 text-right">
            <span
              // Kısaltılan metnin TAMAMI ipucunda: kısaltma bir gösterim tercihi, bilgi kaybı değil.
              title={row.value.endsWith('…') ? (row.full ?? undefined) : undefined}
              className={
                drifted
                  ? 'font-ops-mono text-ops-xs text-ops-faint line-through'
                  : 'min-w-0 break-words font-ops-mono text-ops-xs font-medium text-ops-ink'
              }
            >
              {row.value}
            </span>
            {drifted ? <span className="font-ops-mono text-ops-xs font-semibold text-ops-violet">{now}</span> : null}
          </dd>
        ) : null}
      </div>
      {row.children?.map((child) => (
        <TreeLine key={child.key} row={child} changed={changed} />
      ))}
    </>
  );
}
