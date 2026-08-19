import type { HistoryRowView, TransitRowView } from './transfer-types';

/**
 * Transfer ekranının sözlüğü (19.6). Cümleler tasarımın kendi sesinden (`Operasyon - Transfer.dc`):
 * ekran iki deponun ARASINI anlatır — "yoldaki mal hiçbir deponun stoğunda değildir" bu sayfanın
 * omurga cümlesidir ve boş hâl dahil her metin ona hizalanır.
 */

export const TRANSFER_NOTES = {
  /** Üst şeridin açıklaması — liste neyi kapsıyor, neyi kapsamıyor. */
  transitIntro:
    'Sevk edilmiş, henüz kabul edilmemiş her sevkiyat. Yoldaki mal hiçbir deponun stoğunda değildir — bu liste tamdır, sanal bir "transit depo" yoktur.',
  historyIntro:
    'Gönderilenler ve alınanlar, en yeniden eskiye. Kayıt düzeltilmez, silinmez — olay kaydıdır; yanlışın düzeltmesi ters yönde yeni bir sevktir.',
  /** Boş yoldakiler "bir şey eksik" tonunda GÖSTERİLMEZ (tasarım): boş liste iyi haberdir. */
  transitEmptyTitle: 'Liste boşsa her şey yerindedir',
  transitEmptyBody:
    'Bu küme zamanla büyümez — her kabul bir satır düşürür. Yeni sevkiyat "+ Sevk" ile açılır.',
  historyEmpty: 'Henüz kapanmış transfer yok — ilk sevk kabul edilince burada görünür.',
  lateBanner: (n: number): string => `${n} sevkiyat ulaşım süresini aştı`,
  lateRow:
    'Ulaşım süresini belirgin şekilde aştı — kaybolmuş ya da kabul edilmeyi unutmuş olabilir. Bu mal iki depoda da satılamaz durumda bekliyor.',
} as const;

export const DISPATCH_NOTES = {
  subtitle: 'Sevk ettiğiniz an mal kaynaktan düşer — ara hâl yoktur',
  reference: (no: string, transitDays: number): string =>
    `Belge numarası kaynağın kodunu taşır: ${no} — kâğıt nüsha o depoda dosyalanır. Ulaşım süresi: ${transitDays} gün (Ayarlar).`,
  fefoHint: 'parti önerisi FEFO, karar sizde',
  footNote: 'Öneri kullanılabilir üzerinden yapılır — söz verilmiş mal başka şehre gitmez.',
  /** Varyant kartının üç hâli — motorun `shortReason`ı cümleye burada döner. */
  suggestionOk: 'Öneri karşılandı — en yakın tarihli parti (FEFO). Değiştirebilirsiniz.',
  suggestionNearExpiry:
    'Kısa ömürlü parti işaretlendi: ömrü yolda yanabilir. Uyarı engel değildir — hedefte hızlı tüketilecekse bilerek gönderin.',
  insufficient: (max: number, reserved: number): string =>
    `Gönderilemez — o kadar kullanılabilir mal yok. En çok ${max} adet sevk edilebilir; ayrılmış ${reserved} adet müşteriye söz verilmiştir. Bu bir sınır, tercih değil.`,
  sameWarehouse: 'Kaynak ile hedef aynı depo olamaz — transfer iki tesis arasındadır.',
  emptyLines: 'En az bir kalemde miktar girilmeli.',
} as const;

export const RECEIVE_NOTES = {
  bornAsNewBatch:
    'Kabul edilen mal hedefte yeni bir parti olarak doğar: son tarih ve lot kaynaktan kopyalanır, başka partiyle birleşmez — geri çağırma izi ve gerçek maliyet transferden etkilenmez.',
  /**
   * "Kamyondan listede olmayan mal çıktı" sorusunun cevabı (19.08 kabul eleştirisi): bu pencere
   * yalnız SEVK EDİLENLERİ sayar — fazla mal kaynağın stoğundan düşülmemiştir, buradan kabul etmek
   * yoktan stok yaratmak olurdu. Kayıt gerçeğe, kaynağın keseceği yeni sevkle uydurulur.
   */
  extraGoods:
    'Listede olmayan bir mal çıktıysa buradan giremez: o mal kaynağın stoğundan düşülmemiştir — kaynak depo onun için ayrı bir sevk keser, kabulü o kayıtla yapılır.',
  pendingRows: (n: number): string => `${n} satır boş — kabul tamamlanmaz`,
  zeroIsAStatement: '"0" yazmak ayrı bir beyandır: kutu geldi ama boştu ya da kayboldu.',
  full: 'Tam geldi',
  partial: (missing: number): string =>
    `${missing} eksik — fark kalıcı kayıtta durur, sessizce eşitlenmez`,
  waiting: 'Henüz girilmedi · "0" yazmak "kutu geldi, içi boştu" beyanıdır',
  /** Salt-okunur içerik görünümünün alt satırları — duruma göre tek cümle. */
  viewInTransit: 'Kabulü hedef deponun personeli yapar — bu pencere size içeriği gösterir.',
  viewReceived: 'Kapanmış kayıt — sevk edilen ile gelen satır satır; fark sessizce eşitlenmez.',
  viewCancelled: 'Sevk geri alındı — mal kaynağa geri yazıldı, hedefe hiç girmedi.',
} as const;

/**
 * Kapanmış kaydın sonuç rozeti — dört hâl, tasarımın tonlarıyla. İmza `Pick`: geçmiş satırı da
 * içerik penceresi de (satır toplamlarıyla) aynı rozeti basar, ikinci bir sözlük doğmaz.
 */
export function historyOutcome(
  row: Pick<HistoryRowView, 'outcome' | 'sentQty' | 'receivedQty'>,
): { label: string; tone: 'olive' | 'amber' | 'red' | 'neutral' } {
  switch (row.outcome) {
    case 'full':
      return { label: 'Tam kabul', tone: 'olive' };
    case 'partial':
      return { label: `Kısmi · −${row.sentQty - (row.receivedQty ?? 0)}`, tone: 'amber' };
    case 'zero':
      return { label: 'Sıfır kabul', tone: 'red' };
    case 'cancelled':
      return { label: 'Sevk geri alındı', tone: 'neutral' };
  }
}

/** Yoldaki satırın yaş rozeti — eşik okuma katmanında çözüldü, burada yalnız kelime seçilir. */
export function transitAge(row: TransitRowView): { label: string; tone: 'olive' | 'amber' | 'red' } {
  const label = row.ageDays === 0 ? 'bugün' : `${row.ageDays} gün`;
  return { label, tone: row.ageTone === 'ok' ? 'olive' : row.ageTone === 'warn' ? 'amber' : 'red' };
}
