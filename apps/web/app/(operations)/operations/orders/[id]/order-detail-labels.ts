import type { OrderBoxTrace } from '@lezzet/application';
import { isZeroRated, type OrderDecision } from '@lezzet/domain-core';
import type { DeliveryType, OrderSource, ShipmentStatus } from '@lezzet/types';
import { money, shortDateTime } from '@/components/operation/ui/format';
import type { TimelineStep } from '@/components/operation/ui/timeline';
import type { DeliveryProofView, OrderDetailView } from './order-detail-types';

// Detay sayfasının SÖZLERİ ve türetilmiş gösterim değerleri — masaüstü ve telefon aynı cümleyi
// kursun diye tek yerde. Hesap yok; hesaplanmışın nasıl okunacağı var.

/** Siparişin nereden kapandığı — kolon değeri (`web`) değil, operatörün dili. */
const SOURCE_LABELS: Record<OrderSource, string> = {
  web: 'İnternetten',
  whatsapp: 'WhatsApp',
  // Platform adıyla yazılır, çünkü operatörün bilmesi gereken "sosyal medya" değil hangi uygulama olduğudur.
  messenger: 'Messenger',
  instagram: 'Instagram',
  door: 'Kapı önü',
  manual: 'Elle girildi',
};

export function sourceLabel(source: OrderSource): string {
  return SOURCE_LABELS[source];
}

/**
 * Para başlığı — rozet TUTARI DA SÖYLER (tasarım): "Tahsil edilmedi" ile "Tahsil edilmedi · kapıda
 * 466 €" arasındaki fark, operatörün kartın altına bakmadan karar verebilmesidir. Kısmi tahsilat
 * ayrı bir hâldir: "hiç ödenmedi" ile "yarısı ödendi" aynı cümleyle geçiştirilemez.
 */
export function paymentHeadline(order: OrderDetailView): string {
  const { status, refundDueCents, openCents, refundedCents, overdue, onAccount, dueDate } = order.payment;

  // **Ölçüt DURUMDUR, kalan tutar değil.** "Kalan 0" iki apayrı şeyin cevabı olabiliyor: para geldi,
  // ya da daha alınacak bir şey yok çünkü mal hiç gitmedi. İkisini aynı cümleyle söylemek, tahsil
  // edilmemiş bir siparişe "Ödendi" yazdırıyordu.
  if (status === 'refunded') return `İade edildi · ${money(refundedCents)}`;
  if (status === 'paid') return refundedCents > 0 ? 'Ödendi · kısmi iade edildi' : 'Ödendi';
  if (refundDueCents > 0) return `İade bekliyor · ${money(refundDueCents)}`;
  if (overdue) return `Vadesi geçti · ${money(openCents)}`;
  if (status === 'partial') return `Kısmi tahsil · kalan ${money(openCents)}`;
  return onAccount ? `Vade ${dueDate ?? '—'} · ${money(openCents)}` : `Tahsil edilmedi · ${money(openCents)}`;
}

/**
 * Para hareketi yokken yazılan cümle: vade defterde bekliyor, kapıda alınacak ya da alınacak bir şey yok. Vadeli sipariş havaleyle
 * kapandığı için ona kapıda tahsilat vaat edilmez (DOMAIN §7).
 */
export function emptyMovementsText(order: OrderDetailView): string {
  const { onAccount, dueDate, openCents } = order.payment;
  if (onAccount) return `Henüz hareket yok — vadeli satış, tahsilat ${dueDate ?? 'vade gününde'} havaleyle bekleniyor.`;
  if (openCents > 0) return 'Henüz hareket yok — tahsilat kapıda yapılacak, hareket kurye kapanışında düşer.';
  return 'Henüz hareket yok — bu siparişte tahsil edilecek tutar bulunmuyor.';
}

interface MoneyCellView {
  label: string;
  value: string;
  sub: string;
  tone?: 'red' | 'olive' | 'muted';
}

/**
 * "Sipariş toplamı" hücresinin altındaki taban açıklaması: toplam her siparişte müşterinin borcudur, yani KDV dahildir. Ters
 * yükümlülükte (VIES ile doğrulanmış AB alıcısı) vergi hiç yoktur; orada "dahil" yanıltıcı olurdu.
 */
function vatBasisText(order: OrderDetailView): string {
  return isZeroRated(order.payment.vatTreatment) ? 'KDV yok · ters yükümlülük' : 'KDV dahil';
}

/**
 * Para kartının üç hücresi (tasarım): toplam · tahsil edilen · kalan. Üçüncüsü BAĞLAMA GÖRE
 * ad değiştirir — para geri gidecekse "Kalan" demek yanlış olurdu.
 */
export function moneyCells(order: OrderDetailView): MoneyCellView[] {
  const { totalCents, collectedCents, refundedCents, openCents, refundDueCents, onAccount, method, overdue } =
    order.payment;

  const third: MoneyCellView =
    refundDueCents > 0
      ? { label: 'İade edilecek', value: money(refundDueCents), sub: 'peşin ödenmişti', tone: 'red' }
      : openCents > 0
        ? {
            label: 'Kalan',
            value: money(openCents),
            sub: onAccount
              ? `vade ${order.payment.dueDate ?? '—'}`
              : order.fulfillmentSettled
                ? 'kapıda tahsil edilecek'
                : 'hazırlık sonrası tahsil edilecek',
            tone: overdue ? 'red' : undefined,
          }
        : {
            label: refundedCents > 0 ? 'İade edilen' : 'Kalan',
            value: money(refundedCents > 0 ? refundedCents : 0),
            sub: refundedCents > 0 ? 'geri ödendi' : 'kapandı',
            tone: 'muted',
          };

  return [
    { label: 'Sipariş toplamı', value: money(totalCents), sub: refundedCents > 0 ? 'iade öncesi' : vatBasisText(order) },
    {
      label: 'Tahsil edilen',
      value: money(collectedCents),
      sub: collectedCents > 0 ? (method ?? 'yöntem yok') : 'henüz yok',
      tone: collectedCents > 0 ? 'olive' : 'muted',
    },
    third,
  ];
}

/**
 * Zaman çizelgesi adımları — view-model'den ekranın komponentine. Atlanan adım SÖNÜK ama görünür;
 * ana hat dışına çıkan adım (iptal/iade) kırmızı, gerisi olive.
 */
export function timelineSteps(order: OrderDetailView): TimelineStep[] {
  return order.timeline.map((step) => ({
    key: step.key,
    label: step.label,
    who: step.who,
    when: step.when ? shortDateTime(step.when) : null,
    skipped: step.skipped,
    current: step.current,
    tone: step.offPath ? 'red' : step.warn ? 'amber' : 'olive',
  }));
}

/** Çizelgenin başlık notu — uzun kayıtta okuma anahtarı, kısa kayıtta ne beklendiğini söyler. */
export function timelineNote(order: OrderDetailView): string {
  const skipped = order.timeline.filter((s) => s.skipped).length;
  if (order.timeline.length > 4) {
    return skipped > 0 ? `${order.timeline.length} adım · atlanan gri` : `${order.timeline.length} adım`;
  }
  return skipped > 0 ? 'kısa kayıt · atlanan gri' : 'kısa kayıt';
}

/**
 * Kararların ekrandaki sözü — motor HANGİSİ olduğunu söyler (`allowedDecisions`), burası ne demek
 * olduğunu. Alt satır sonucu anlatır, çünkü bu üç kararın hepsi geri alınması pahalı şeylere
 * dokunuyor: stok, para, müşteriye giden bildirim.
 */
interface DecisionCopy {
  label: string;
  sub: string;
  cta: string;
  tone: 'amber' | 'red';
}

export const DECISION_COPY: Record<OrderDecision, DecisionCopy> = {
  partial_fulfillment: {
    label: 'Kısmi karşılama',
    sub: 'Hangi kalemden kaç adet eksik gidiyor — tutardan düşülür, ayrılan stok serbest kalır. Teslimden önce.',
    cta: 'Aç →',
    tone: 'amber',
  },
  refund: {
    label: 'İade başlat',
    sub: 'Malın akıbeti + para yolu. Tutarı sistem hesaplar, siz onaylarsınız.',
    cta: 'Aç →',
    tone: 'red',
  },
  cancel: {
    label: 'Siparişi iptal et',
    sub: 'Hazırlık durur, ayrılan stok serbest kalır. Tahsil edilmiş tutar iadeye devrolur.',
    cta: 'İptal →',
    tone: 'red',
  },
};

/** Ad baş harfleri — sağ raydaki müşteri künyesi. İki kelimeden fazlası okunmaz, ilk ikisi yeter. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((p) => p[0]?.toLocaleUpperCase('tr-TR') ?? '').join('') || '—';
}

/** Vade limitinin ne kadarı kullanıldı — doluluk çubuğunun genişliği. Limit yoksa çubuk çizilmez. */
export function creditPercent(order: OrderDetailView): string {
  const credit = order.customer.credit;
  if (!credit?.limitCents) return '0%';
  return `${Math.min(100, Math.round((credit.openBalanceCents / credit.limitCents) * 100))}%`;
}

/**
 * Doluluk rengi: gecikme varsa kırmızı, limitin dörtte üçünü aştıysa amber, aksi halde olive.
 * Eşik (%75) parametrik bir karar değil, gözle okunan bir uyarı çizgisidir.
 */
export function creditFill(order: OrderDetailView): string {
  const credit = order.customer.credit;
  if (order.payment.overdue) return 'bg-ops-red';
  if (credit?.limitCents && credit.openBalanceCents / credit.limitCents > 0.75) return 'bg-ops-amber';
  return 'bg-ops-olive';
}

/**
 * Gönderi durumu taşıyıcının taksonomisidir, sipariş durumu değil: sipariş "yolda"yken gönderi "sıralama merkezinde" olabilir. `error`
 * "müdahale gerekiyor" diye yazılır, çünkü kod bir arıza değil bir karar bekliyor (adres geçersiz, teslim edilemedi).
 */
export const SHIPMENT_STATUS_LABEL: Record<ShipmentStatus, string> = {
  created: 'Etiket hazır',
  handed_over: 'Taşıyıcıda',
  in_transit: 'Yolda',
  out_for_delivery: 'Dağıtımda',
  delivered: 'Teslim edildi',
  returned: 'Geri dönüyor',
  cancelled: 'İptal edildi',
  error: 'Müdahale gerekiyor',
};

export const PROOF_KIND_LABEL: Record<DeliveryProofView['kind'], string> = {
  box_scan: 'kutu QR',
};

/** Sipariş detayının kısa cümleleri — ekranda tekrarlanan metin koda gömülmez. */
export const ORDER_NOTES = {
  proofBoxScan:
    'Kanıt, kapıda okutulan kutu QR kodları — görseli yoktur, okutulan kodlar teslim kaydında duruyor.',
  /** Kutu izi boş: hazırlık kutuyla başlar (mobil depo ekranı); kutu yoksa çıkan bir şey de yok. */
  noBoxes: 'kutu açılmadı',
} as const;

/**
 * Kutu satırının izi: damgalar sırayla ve yalnız varsa yazılır (mühür → yükleme ya da devir → kapı); `loaded_at` rotada araca yüklemeyi,
 * kargoda taşıyıcıya devri söyler. Kapı damgası bilinmiyorsa (`null`) hiçbir şey yazılmaz ve çözülemeyen personel adı uydurulmaz.
 */
export function boxTrailOf(box: OrderBoxTrace, type: DeliveryType): string[] {
  const who = (name: string | null): string => (name ? ` ${name}` : '');
  const trail = [box.sealedAt ? `mühür ${shortDateTime(box.sealedAt)}${who(box.sealedBy)}` : 'açık — masada dolduruluyor'];
  if (box.loadedAt) {
    trail.push(`${type === 'shipping' ? 'taşıyıcıya verildi' : 'araca yüklendi'} ${shortDateTime(box.loadedAt)}${who(box.loadedBy)}`);
  }
  if (box.scannedAtDoor !== null) trail.push(box.scannedAtDoor ? 'kapıda okutuldu' : 'kapıda okutulmadı');
  return trail;
}
