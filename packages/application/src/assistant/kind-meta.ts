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
/**
 * Kararın CİNSİ — kuyruk ekranı hangi kapıyı açacağını buradan okur (kullanıcı kararı 09.08).
 *
 * Kuyruk ilk hâlinde tek kapılıydı: onayla ya da reddet. Gerçek kullanım bunu çürüttü — *"bölgeye
 * hangi posta kodlarının gireceğine haritaya bakmadan karar veremem; paketten bir kalemi
 * çıkarabilmeliyim"*. Doğru cevap kuyruğa on tane form yazmak DEĞİL (hepsi mevcut operasyon
 * ekranlarının kopyası olurdu); önerinin **cinsine göre** doğru yere göndermek:
 *
 * - `apply` — düzenlenecek bir şey yok, tek tık uygulanır (vitrin işareti bir boolean'dır).
 * - `draft_then_edit` — uygulama PASİF/taslak bir kayıt doğurur; ince ayar o varlığın kendi
 *   ekranında yapılır. Kuyruğun işi köprüyü vermek: "oluştu, düzenlemeye git".
 * - `handoff` — etki geri alınamaz (bildirim gider, stok satılabilir olur, defter yazılır), yani
 *   karar ÖNCESİ düzenleme şart. Kuyruk uygulamaz, ilgili ekranı ÖN DOLDURUR; kayıt oradan ve
 *   normal akışla olur. İkinci yazma yolu yine açılmaz.
 */
export type ProposalMode = 'apply' | 'draft_then_edit' | 'handoff';

interface KindMeta {
  label: string;
  impact: string;
  tables: string[];
  mode: ProposalMode;
  /**
   * Devrin/köprünün hedef VARLIĞI — ekran URL'i bundan kurar.
   *
   * URL'in kendisi bilerek BURADA DEĞİL: rota sözleşmesi operasyon yüzeyinin işidir (`*-url.ts`),
   * uygulama katmanı ekran bilmez (`STACK §4`). Burada duran şey "hangi varlık", orada duran şey
   * "o varlık hangi adreste".
   */
  target: string;
  /**
   * `draft_then_edit` tiplerinde doğan kaydın `result` içindeki anahtarı (`{ bundleId: … }`).
   * Köprü ancak bu kimlikle kurulabilir; anahtar uygulayıcının döndürdüğü adla birebir aynıdır.
   */
  resultKey?: string;
}

export const KIND_META = {
  bundle_draft: {
    label: 'Paket',
    impact:
      'Katalogda yeni bir paket oluşur ve PASİF doğar — müşteri vitrininde görünmez. Kalem çıkarmak/eklemek ve payları değiştirmek paket ekranının işi; yayına almak ayrı bir karardır.',
    tables: ['bundle', 'bundle_item'],
    mode: 'draft_then_edit',
    target: 'bundle',
    resultKey: 'bundleId',
  },
  featured_flag: {
    label: 'Vitrin',
    impact: 'Kayıt ana sayfa vitrinine girer ya da çıkar. Yayın durumu (aktif/pasif) DEĞİŞMEZ — bu ayrı bir eksendir.',
    tables: ['category', 'collection', 'bundle'],
    // Payload bir boolean: düzenlenecek bir şey yok, ara ekran gereksiz sürtünme olurdu.
    mode: 'apply',
    target: 'featured',
  },
  purchase_order: {
    label: 'Tedarik',
    impact:
      'Tedarik siparişi TASLAK olarak açılır; tedarikçiye gönderilmez. Kalem ve adet düzeltmesi tedarik ekranında yapılır, göndermek ayrı ve insanlı bir adımdır.',
    tables: ['purchase_order', 'purchase_order_item'],
    mode: 'draft_then_edit',
    target: 'purchase_order',
    resultKey: 'purchaseOrderId',
  },
  stock_intake: {
    label: 'Stok',
    impact:
      'Partiler stoğa girer ve satılabilir hâle gelir; son kullanma tarihleri bu tabloyla sabitlenir. Bağlı tedarik siparişi varsa kapanışı da bu kabulden türer.',
    tables: ['stock_intake', 'stock'],
    // Geri alınamaz: giren parti satılabilir olur ve SKT o an sabitlenir. Faturadan okunan
    // miktar/tarih gözle doğrulanmadan yazılmamalı — mal kabul ekranı ön doldurulur.
    mode: 'handoff',
    target: 'receiving',
  },
  money_movement: {
    label: 'Para',
    impact:
      'Muhasebe defterine bir hareket yazılır ve hesap bakiyesi değişir. Kayıt SİLİNMEZ — düzeltmesi ters kayıtladır.',
    tables: ['money_movement'],
    // Silinemeyen bir defter satırı: tutar ve hesap onaydan önce görülüp düzeltilebilmeli.
    mode: 'handoff',
    target: 'finance',
  },
  zone_extend: {
    label: 'Bölge',
    impact:
      'Posta kodları bölgeye eklenir, o adreslerde teslimat açılır ve haber bekleyen müşterilere "bölgeniz açıldı" bildirimi gider. BİLDİRİM GERİ ALINAMAZ: bölgeyi sonra kapatsanız bile mesaj gitmiş olur.',
    tables: ['delivery_zone_postal_code', 'zone_notice'],
    // Kuyruğun tek kapılı hâlinin çöktüğü yer (kullanıcı 09.08): "hangi kod girsin" sorusu
    // haritasız cevaplanamaz ve bildirim kısmi seçime bağlıdır. Rota ekranı ön doldurulur.
    mode: 'handoff',
    target: 'routes',
  },
  product_create: {
    label: 'Yeni ürün',
    impact:
      'Katalogda yeni bir ürün oluşur ve ADAY olarak doğar — vitrinde görünmez, satılamaz. Satışa çıkarmak ayrı bir karardır ve bu yoldan verilemez. Fiyat ve stok girilmez; ikisi de ayrı iştir.',
    tables: ['product', 'product_variant'],
    // Kayıt aday doğuyor ve düzenlemesi ürün ekranında — paket/tarif ile aynı desen.
    mode: 'draft_then_edit',
    target: 'product',
    resultKey: 'productId',
  },
  product_draft: {
    label: 'Ürün',
    impact:
      'Ürünün metin alanları güncellenir ama ürün TASLAKTA KALIR. Alerjen ve saklama beyanı bu yoldan yazılamaz — onlar dolmadan ürün yayına alınamaz.',
    tables: ['product'],
    mode: 'draft_then_edit',
    target: 'product',
    resultKey: 'productId',
  },
  discount_draft: {
    label: 'İndirim',
    impact:
      'Kampanya PASİF doğar — hiçbir sepete işlemez. Kapsamı, tarihi ve oranı indirim ekranında düzenlenir; yayına almak ayrı bir karardır.',
    tables: ['discount'],
    mode: 'draft_then_edit',
    target: 'discount',
    resultKey: 'discountId',
  },
  batch_offer: {
    label: 'Fırsat',
    impact:
      'Partiye indirimli satış fiyatı yazılır ve o parti ANINDA fırsat olarak vitrine düşer — taslak evresi yoktur. Aynı ürünün öteki partileri tam fiyatta kalır. Geri almak teklifi kaldırmaktır.',
    tables: ['stock'],
    // ── İLK YAZIMDA `apply` DENMİŞTİ, TARAMADA DÜZELTİLDİ (09.08) ───────────
    // "Tek sayı, düzenlenecek bir şey yok" diye düşünülmüştü. Yanlıştı: teklif fiyatının ÜÇ YÜZÜ
    // var (tutar · listeye göre indirim · alışa göre marj) ve `offer-dialog` üçünü birden
    // gösteriyor. Kuyrukta tek sayı onaylamak, marjı GÖRMEDEN fiyat onaylamaktır — zararına satışı
    // fark etmenin tek yeri o diyalogdur. Üstelik patron rakamı değiştirmek isteyebilir ve
    // "onayla/reddet" ona bu yolu hiç vermiyordu.
    mode: 'handoff',
    target: 'stock',
    resultKey: 'stockId',
  },
  recipe_draft: {
    label: 'Tarif',
    impact:
      'Tarif PASİF doğar. Üç dil dolmadan yayına alınamaz; malzeme ve adım düzenlemesi tarif ekranında yapılır.',
    tables: ['recipe', 'recipe_item'],
    mode: 'draft_then_edit',
    target: 'recipe',
    resultKey: 'recipeId',
  },
} as const satisfies Record<AssistantProposalKind, KindMeta>;

/** Kararın cinsi — ekran kapıyı buradan seçer (`satisfies` sayesinde yeni tip eklenince derlenmez). */
export function modeOf(kind: AssistantProposalKind): ProposalMode {
  return KIND_META[kind].mode;
}

/**
 * "Uygulanınca ne olur" — sabit şablon + ÖNERİYE ÖZGÜ sayı (operasyon şeridinin itirazı, 09.08).
 *
 * İtiraz haklıydı ve şuydu: aynı `zone_extend`in biri bildirim gönderir, biri göndermez (bekleyen
 * yoksa) — "gider" diyen sabit bir cümle ikinci hâlde YALAN söyler. Ama cümleyi tümüyle üreten
 * araca bırakmak da doğru değildi: o zaman metni MODEL yazardı ve geri alınamaz bir etkiyi
 * yumuşatan bir cümle kurabilirdi.
 *
 * Orta yol: **iskelet burada sabit** (asistan değiştiremez), **sayı payload'dan okunur** (öneriye
 * özgü ve gerçek). Kolon açmaya gerek yok — veri zaten payload'da.
 */
export function impactOf(kind: AssistantProposalKind, payload: unknown): string {
  const base = KIND_META[kind].impact;
  if (!payload || typeof payload !== 'object') return base;
  const p = payload as Record<string, unknown>;

  if (kind === 'zone_extend' && Array.isArray(p.postalCodes)) {
    const codes = p.postalCodes as Array<{ waitingCount?: unknown }>;
    const waiting = codes.reduce((sum, c) => sum + (typeof c.waitingCount === 'number' ? c.waitingCount : 0), 0);
    // Bekleyen YOKSA cümle bildirimden hiç söz etmez: olmayan bir dış etkiyi uyarmak, gerçek
    // uyarıyı da değersizleştirir ("nasılsa hep yazıyor").
    return waiting === 0
      ? `${codes.length} posta kodu bölgeye eklenir ve o adreslerde teslimat açılır. Bu kodlarda haber bekleyen müşteri yok — bildirim gitmeyecek.`
      : `${codes.length} posta kodu bölgeye eklenir, o adreslerde teslimat açılır ve haber bekleyen ${waiting} müşteriye bildirim gider. BİLDİRİM GERİ ALINAMAZ: bölgeyi sonra kapatsanız bile mesaj gitmiş olur.`;
  }

  if (kind === 'stock_intake' && Array.isArray(p.lines)) {
    return `${p.lines.length} parti stoğa girer ve satılabilir hâle gelir; son kullanma tarihleri bu tabloyla sabitlenir. Bağlı tedarik siparişi varsa kapanışı da bu kabulden türer.`;
  }

  if (kind === 'purchase_order' && Array.isArray(p.lines)) {
    return `${p.lines.length} kalemlik tedarik siparişi TASLAK olarak açılır; tedarikçiye gönderilmez. Göndermek ayrı ve insanlı bir adımdır.`;
  }

  if (kind === 'bundle_draft' && Array.isArray(p.items)) {
    return `${p.items.length} kalemlik yeni bir paket oluşur ve PASİF doğar — müşteri vitrininde görünmez. Yayına almak ayrı bir karardır.`;
  }

  // ── BEYAN TİPLERİNDE CÜMLE TAMLIKTAN KURULUR (22.6) ────────────────────────
  // Ekranın en önemli tek bilgisi "onaylarsam kayıt tam olur mu". Ölçüt motordan geliyor
  // (`missingDeclarations` → payload'daki `remainingGaps`), araç kendi ölçütünü uydurmuyor.
  if (kind === 'product_create' || kind === 'product_draft') {
    const gaps = Array.isArray(p.remainingGaps) ? (p.remainingGaps as string[]) : [];
    const tail =
      gaps.length === 0
        ? 'Onaylanırsa ürünün yasal beyanı TAM olur.'
        : `Onaylansa bile şu beyanlar EKSİK kalır: ${gaps.map((g) => GAP_LABEL[g] ?? g).join(' · ')} — eksik beyanlı ürün satışa çıkamaz.`;
    if (kind === 'product_create') return `${base} ${tail}`;
    const fields = p.fields && typeof p.fields === 'object' ? Object.keys(p.fields as Record<string, unknown>) : [];
    const head = fields.length > 0 ? `Ürünün ${fields.join(' ve ')} alanı güncellenir` : 'Ürünün beyan alanları güncellenir';
    return `${head} ama ürün TASLAKTA KALIR. ${tail}`;
  }

  return base;
}

/** Eksik beyan adları — motorun `DeclarationGap` kümesiyle birebir (`missingDeclarations`). */
const GAP_LABEL: Record<string, string> = {
  lang: 'üç dilde ad',
  ingredients: 'içindekiler',
  nutrition: 'besin künyesi',
  storage: 'saklama koşulu',
  allergens: 'alerjen listesi',
};

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
