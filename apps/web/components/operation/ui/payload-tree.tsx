'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { LOCALES, type Locale } from '@lezzet/i18n';
import { UnderlineTabs } from './underline-tabs';
import { ChevronDownIcon } from './icons';
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
 * · **Değer** tipine göre biçimlenir — para cent'ten euro'ya, ISO tarih kısa tarihe, boolean
 *   evet/hayıra.
 * · **Kimlik GİZLENİR.** `…Id` alanları hiç yazılmaz: uuid okunmaz ve yanındaki `…Name` zaten aynı
 *   şeyi söyler. Bir kimliğin tek başına durduğu yerde (ad alanı yoksa) kısaltılmış hâli yazılır ki
 *   satır sessizce kaybolmasın.
 *
 * ── ÜÇ GÜRÜLTÜ KAYNAĞI, ÜÇ KARAR (11.08 · kullanıcı ölçümü) ─────────────────
 * Ekrandaki şikâyet netti: *"dil konusu burayı çok karmaşık gösteriyor ve bu iç içe JSON yapıların
 * hepsinde aynı duruma sebep olacak"* + *"besin künyesi de var… dolayısıyla asistanın önerisi değil
 * hepsi."*
 *
 * 1. **DİL BİR EKSENDİR, ÜÇ SATIR DEĞİL.** Çok dilli her alan üç çocuk satır doğuruyordu; on alanlı
 *    bir dilekçe kırk satıra çıkıyordu. Artık üstte TEK dil seçici var ve her alan seçili dilde tek
 *    satır. **Eksik gizlenmiyor, sayılıyor:** sekmenin yanındaki sayı o dilde BOŞ kalan alan
 *    adedidir — "FR 2" görünüyorsa iki alan Fransızcasız demektir. Ölçülemeyen değeri saklamak değil,
 *    tam tersi: eksik artık tek bakışta okunuyor (`CLAUDE §1`).
 * 2. **İÇ İÇE YAPI KATLANIR.** Nesne ve nesne dizileri artık açılıp kapanan bir başlık; kapalıyken
 *    kaç alan/kalem taşıdığını söyler. Derin yapı sütunu boydan boya doldurmuyor.
 * 3. **BAĞLAM ÖNERİ DEĞİLDİR.** `currentFields` kaydın BUGÜNKÜ hâli — asistanın dokunmadığı yer.
 *    Aynı tonda basılınca "hepsi öneri" gibi okunuyordu (kullanıcı: *"asistan sadece açıklamada üç
 *    dile tamamlama yaptı ama burada tüm bilgiler var"*). Artık kapalı açılıyor ve başlığında ne
 *    olduğu yazıyor; sütunun okuma sırası "asistan ne yazacak" → "bugün ne var" oluyor.
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
  fields: 'Asistanın yazacakları',
  currentFields: 'Ürünün bugünkü hâli',
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

/**
 * Kökteki grupların ne OLDUĞUNU söyleyen alt başlık — ve kapalı doğup doğmadıkları.
 *
 * `currentFields` bir öneri DEĞİL, karşılaştırma zeminidir; kapalı doğar. Ötekiler kararın konusu,
 * açık doğar. Ölçüt anahtarın kendisinde çünkü ayrım payload'ın anlamında: hangi alanın yazılacağı
 * ile hangisinin bugün ne olduğu ayrı iki şey ve şema ikisini ayrı taşıyor.
 */
const SECTION: Record<string, { note: string; closed?: boolean }> = {
  fields: { note: 'onaylarsan bunlar yazılır' },
  currentFields: { note: 'karşılaştırma için — asistan dokunmuyor', closed: true },
  uncertainFields: { note: 'asistan net okuyamadı' },
  remainingGaps: { note: 'onaydan sonra da eksik kalır' },
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

/** Çok dilli metin mi — öyleyse seçili dilin karşılığı tek satırda gösterilir. */
function isLocalized(value: object): boolean {
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((k) => (LOCALES as readonly string[]).includes(k));
}

/** Bir dilde yazılı mı — boşluk yazı sayılmaz. */
function textOf(obj: Record<string, unknown>, lang: Locale): string {
  const raw = obj[lang];
  return typeof raw === 'string' ? raw.trim() : '';
}

interface TreeRow {
  key: string;
  label: string;
  value: string | null;
  depth: number;
  /** Kısaltılmışsa metnin tamamı — satırın ipucunda okunur. */
  full?: string;
  /** Grup satırının alt başlığı (kökteki bölümler). */
  note?: string;
  /** Grup kapalı DOĞAR mı — bağlam bölümleri için. */
  closed?: boolean;
  /** Alt satırlar (nesne/dizi açılımı). */
  children?: TreeRow[];
}

/** Anahtarı okunur bir başlığa çevirir — sözlükte yoksa camelCase ayrılır. */
function labelOf(key: string): string {
  if (FIELD_LABEL[key]) return FIELD_LABEL[key];
  const spaced = key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function buildRows(value: unknown, depth: number, keyPrefix: string, lang: Locale): TreeRow[] {
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
    const section = depth === 0 ? SECTION[key] : undefined;
    const scalar = formatScalar(key, raw);
    if (scalar !== null) {
      return [{ key: id, label: labelOf(key), value: scalar, depth, ...(typeof raw === 'string' ? { full: raw } : {}) }];
    }

    if (Array.isArray(raw)) {
      if (raw.length === 0) return [{ key: id, label: labelOf(key), value: '—', depth, ...(section ?? {}) }];
      // Kapalı kümeler (alerjen, eksik beyan) tek satırda; nesne dizileri açılır.
      if (raw.every((item) => typeof item === 'string')) {
        return [{ key: id, label: labelOf(key), value: raw.join(' · '), depth, ...(section ?? {}) }];
      }
      return [
        {
          key: id,
          label: labelOf(key),
          value: `${num(raw.length)} kalem`,
          depth,
          ...(section ?? {}),
          children: raw.flatMap((item, i) => buildRows(item, depth + 1, `${id}.${i}.`, lang)),
        },
      ];
    }

    const obj = raw as Record<string, unknown>;
    if (isLocalized(obj)) {
      // TEK SATIR, seçili dilde. Üç dili birden basmak sütunu üçe katlıyordu; eksik dil de artık
      // satırda değil, dil sekmesinin sayacında görünür.
      const text = textOf(obj, lang);
      return [{ key: id, label: labelOf(key), value: text ? clamp(text) : '—', full: text || undefined, depth }];
    }

    const children = buildRows(obj, depth + 1, `${id}.`, lang);
    return [
      {
        key: id,
        label: labelOf(key),
        value: children.length > 0 ? `${num(children.length)} alan` : '—',
        depth,
        ...(section ?? {}),
        children,
      },
    ];
  });
}

/** Payload'daki çok dilli alanların DİL BAŞINA boş sayısı — sekmelerin yanındaki uyarı sayacı. */
function countGaps(value: unknown, acc: Record<Locale, number>, seen: { any: boolean }): void {
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item) => countGaps(item, acc, seen));
    return;
  }
  const obj = value as Record<string, unknown>;
  if (isLocalized(obj)) {
    seen.any = true;
    for (const lang of LOCALES) if (!textOf(obj, lang)) acc[lang] += 1;
    return;
  }
  Object.values(obj).forEach((child) => countGaps(child, acc, seen));
}

/**
 * Dilekçeyi okunur satırlara çevirip basar.
 *
 * `changed` verilirse o alan SAPMA gösterir: asistanın değeri üstü çizili kalır, operatörünki mor
 * yazılır. Ayrı bir "değişiklikler listesi" kurulmaz — fark, ait olduğu satırın üstünde durur.
 */
export function PayloadTree({ payload, changed }: { payload: unknown; changed?: Record<string, string> }): ReactNode {
  const [lang, setLang] = useState<Locale>('tr');
  // Katlanan grupların AÇIK/KAPALI hâli; sözlükte olmayan grup kendi varsayılanıyla çizilir.
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const rows = useMemo(() => buildRows(payload, 0, '', lang), [payload, lang]);
  const gaps = useMemo(() => {
    const acc = { tr: 0, fr: 0, de: 0 } as Record<Locale, number>;
    const seen = { any: false };
    countGaps(payload, acc, seen);
    return { acc, any: seen.any };
  }, [payload]);

  if (rows.length === 0) return null;

  const toggle = (key: string, isOpen: boolean) => setOpen((prev) => ({ ...prev, [key]: !isOpen }));

  return (
    <div className="flex flex-col gap-2">
      {/* Dil ekseni yalnız çok dilli alan VARSA çizilir — üç sayının hepsi sıfır olan bir sekme barı,
          ilgisiz bir dilekçenin (fiyat, stok) tepesinde anlamsız bir kontrol olurdu. */}
      {gaps.any ? (
        <UnderlineTabs
          value={lang}
          onChange={setLang}
          className="-mt-1"
          items={LOCALES.map((l) => ({
            key: l,
            label: (
              <span className="flex items-baseline gap-1">
                {l.toUpperCase()}
                {gaps.acc[l] > 0 ? <span className="font-ops-body text-ops-micro font-medium text-ops-amber">{gaps.acc[l]}</span> : null}
              </span>
            ),
            title: gaps.acc[l] > 0 ? `${gaps.acc[l]} alan bu dilde boş` : 'Bu dilde eksik yok',
          }))}
        />
      ) : null}

      <dl className="flex flex-col gap-[3px] font-ops-body text-ops-sm">
        {rows.map((row) => (
          <TreeLine key={row.key} row={row} changed={changed} open={open} onToggle={toggle} />
        ))}
      </dl>
    </div>
  );
}

function TreeLine({
  row,
  changed,
  open,
  onToggle,
}: {
  row: TreeRow;
  changed?: Record<string, string>;
  open: Record<string, boolean>;
  onToggle: (key: string, isOpen: boolean) => void;
}): ReactNode {
  const now = changed?.[row.key];
  const drifted = now !== undefined && now !== row.value;
  const group = (row.children?.length ?? 0) > 0;
  const isOpen = open[row.key] ?? !row.closed;

  const head = (
    <>
      <dt className={`flex min-w-0 shrink-0 items-baseline gap-1.5 ${row.depth > 0 ? 'text-ops-faint' : 'text-ops-muted'}`}>
        {group ? (
          <span className={`flex-none transition-transform ${isOpen ? '' : '-rotate-90'}`}>
            <ChevronDownIcon size={10} />
          </span>
        ) : null}
        {row.label}
        {/* Bölümün NE OLDUĞU başlığın yanında: "bugünkü hâl" ile "yazılacak" ayrımı, kapalıyken de
            okunabilmeli — açmadan karar verilebilsin. */}
        {row.note ? <span className="truncate font-ops-body text-ops-micro text-ops-faint">{row.note}</span> : null}
      </dt>
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
    </>
  );

  return (
    <>
      {group ? (
        <button
          type="button"
          onClick={() => onToggle(row.key, isOpen)}
          aria-expanded={isOpen}
          className="flex w-full cursor-pointer items-baseline justify-between gap-2.5 text-left"
          // Girinti derinlikten: iç içe yapı çizgiyle değil boşlukla anlatılıyor — dar sütunda çizgi
          // değerin yerini yiyor.
          style={row.depth > 0 ? { paddingLeft: `${row.depth * 10}px` } : undefined}
        >
          {head}
        </button>
      ) : (
        <div
          className="flex items-baseline justify-between gap-2.5"
          style={row.depth > 0 ? { paddingLeft: `${row.depth * 10}px` } : undefined}
        >
          {head}
        </div>
      )}
      {group && isOpen
        ? row.children?.map((child) => <TreeLine key={child.key} row={child} changed={changed} open={open} onToggle={onToggle} />)
        : null}
    </>
  );
}
