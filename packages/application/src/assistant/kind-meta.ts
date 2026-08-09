import type { AssistantProposalKind } from '@lezzet/types';

/**
 * Öneri tipinin EKRAN KÜNYESİ (22.3) — rozet metni, "uygulanınca ne olur" cümlesi, hedef tablolar.
 *
 * **Neden kapıda, ekranda değil:** üç şey de tipin DEĞİŞMEZ özelliği; ekrana yazılsalardı panelin
 * ikinci bir gerçek kaynağı olurdu ve tip eklendiğinde biri unutulurdu. `satisfies Record<…>`
 * sayesinde yeni bir `kind` eklendiği an burası DERLENMEZ — unutmak mümkün değil.
 *
 * Hedef tablolar gerçek şema adlarıdır (tasarımın fikstüründeki `packages`/`cash_entries` gibi
 * kurgusal adlar DEĞİL — `docs/talep/operasyon-asistan-kuyrugu-veri-sozlesmesi.md §2b`).
 */
interface KindMeta {
  label: string;
  impact: string;
  tables: string[];
}

export const KIND_META = {
  bundle_draft: {
    label: 'Paket',
    impact:
      'Katalogda yeni bir paket oluşur ve PASİF doğar — müşteri vitrininde görünmez. Yayına almak ayrı bir karardır (katalog ekranı).',
    tables: ['bundle', 'bundle_item'],
  },
  featured_flag: {
    label: 'Vitrin',
    impact: 'Kayıt ana sayfa vitrinine girer ya da çıkar. Yayın durumu (aktif/pasif) DEĞİŞMEZ — bu ayrı bir eksendir.',
    tables: ['category', 'collection', 'bundle'],
  },
  purchase_order: {
    label: 'Tedarik',
    impact:
      'Tedarik siparişi TASLAK olarak açılır; tedarikçiye gönderilmez. Göndermek ayrı ve insanlı bir adımdır (tedarik ekranı).',
    tables: ['purchase_order', 'purchase_order_item'],
  },
  stock_intake: {
    label: 'Stok',
    impact:
      'Partiler stoğa girer ve satılabilir hâle gelir; son kullanma tarihleri bu tabloyla sabitlenir. Bağlı tedarik siparişi varsa kapanışı da bu kabulden türer.',
    tables: ['stock_intake', 'stock'],
  },
  money_movement: {
    label: 'Para',
    impact:
      'Muhasebe defterine bir hareket yazılır ve hesap bakiyesi değişir. Kayıt SİLİNMEZ — düzeltmesi ters kayıtladır.',
    tables: ['money_movement'],
  },
  zone_extend: {
    label: 'Bölge',
    impact:
      'Posta kodları bölgeye eklenir, o adreslerde teslimat açılır ve haber bekleyen müşterilere "bölgeniz açıldı" bildirimi gider. BİLDİRİM GERİ ALINAMAZ: bölgeyi sonra kapatsanız bile mesaj gitmiş olur.',
    tables: ['delivery_zone_postal_code', 'zone_notice'],
  },
  product_draft: {
    label: 'Ürün',
    impact:
      'Ürünün metin alanları güncellenir ama ürün TASLAKTA KALIR. Alerjen ve saklama beyanı bu yoldan yazılamaz — onlar dolmadan ürün yayına alınamaz.',
    tables: ['product'],
  },
  discount_draft: {
    label: 'İndirim',
    impact: 'Bu tip henüz uygulanamıyor.',
    tables: ['discount'],
  },
  recipe_draft: {
    label: 'Tarif',
    impact: 'Bu tip henüz uygulanamıyor.',
    tables: ['recipe', 'recipe_item'],
  },
} as const satisfies Record<AssistantProposalKind, KindMeta>;

/**
 * Önerinin TUTARI — tipe göre payload'dan türer; tutar kavramı olmayan tipte `null`.
 *
 * **Ekran bunu hesaplamaz** (sözleşme): aynı türetme iki yerde yazılsaydı biri bir gün ötekinden
 * ayrılır ve listede görünen tutar kartta başka çıkardı.
 */
export function amountCentsOf(kind: AssistantProposalKind, payload: unknown): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;

  // Paket fiyatı EURO tutulur (paket ailesi cent'e göçmedi — `Bundle.totalPrice`); çevrim burada.
  if (kind === 'bundle_draft' && typeof p.totalPrice === 'number') return Math.round(p.totalPrice * 100);
  if (kind === 'money_movement' && typeof p.amountCents === 'number') return p.amountCents;

  // Mal kabulde tutar KALEMLERDEN toplanır; bir kalemin maliyeti bilinmiyorsa toplam UYDURULMAZ
  // (eksik veriyi 0 saymak faturayı olduğundan ucuz gösterirdi — `packages.ts` ağırlık kuralının aynısı).
  if (kind === 'stock_intake' && Array.isArray(p.lines)) {
    const lines = p.lines as Array<{ qty?: unknown; unitCostCents?: unknown }>;
    if (lines.length === 0) return null;
    let total = 0;
    for (const line of lines) {
      if (typeof line.unitCostCents !== 'number' || typeof line.qty !== 'number') return null;
      total += line.unitCostCents * line.qty;
    }
    return total;
  }
  return null;
}
