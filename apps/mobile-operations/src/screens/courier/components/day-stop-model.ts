import type { CourierStopContract } from '@lezzet/types';

import { timeOf } from '@/lib/operations/stamp';
import { fillCopy } from '@/screens/operations/copy';
import { courierCopy } from '../copy';
import { money } from '../courier-format';

const t = courierCopy;

/** Durak dairesinin beş hâli; sözleşmenin sonucu dörtlüdür, kısmi teslim yalnız çizimde ayrılır. */
export type CircleTone = 'delivered' | 'partial' | 'issue' | 'next' | 'idle';

/** Kısmi teslim: sipariş teslim edildi ama bir kalemin bırakılan adedi siparişten az; daire, etiket ve alt satır aynı kuralı sorar. */
export function isPartial(stop: CourierStopContract): boolean {
  return stop.outcome === 'delivered' && stop.items.some((line) => line.fulfilledQty < line.qty);
}

/** Kısmi durağın adet dökümü — sipariş edilen ve fiilen bırakılan toplam. */
function partialCounts(stop: CourierStopContract): { total: number; done: number } {
  return stop.items.reduce((sum, line) => ({ total: sum.total + line.qty, done: sum.done + line.fulfilledQty }), { total: 0, done: 0 });
}

/** Grubun meta satırı: künye, hâl ve takılı sayısı; kapanmış sefer de listede kalabildiği için hâl iki değerlidir. */
export function groupMetaOf(run: { referenceNo: string; closed: boolean } | undefined, issues: number): string {
  if (run === undefined) return '';
  const parts = [run.referenceNo, run.closed ? t.day.groupClosed : t.day.groupDriving];
  // Sıfır yazılmaz: olmayan bir sorunu duyurmak her grubu bir uyarıya çevirirdi.
  if (issues > 0) parts.push(fillCopy(t.day.stuckCount, { n: String(issues) }));
  return parts.join(' · ');
}

/** Sonuç dairesinin tonu; "sıradaki" yalnız yola çıkılmışsa konur ve iptal edilmiş durak sorunlu sayılır, çünkü araçta yanlış yerde bir mal vardır. */
export function circleTone(stop: CourierStopContract, isNext: boolean, started: boolean): CircleTone {
  if (stop.cancelled) return 'issue';
  if (stop.outcome === 'delivered') return isPartial(stop) ? 'partial' : 'delivered';
  if (stop.outcome === 'unreachable' || stop.outcome === 'refused') return 'issue';
  return isNext && started ? 'next' : 'idle';
}

/**
 * Sonuçlanmış durağın etiketi ("TESLİM EDİLDİ · 14:12"): rota bir sıradır ve saat o sıranın işaretidir. Damga yoksa etiket saatsiz yazılır,
 * sonuçlanmamış durakta etiket yoktur.
 */
export function stopTag(stop: CourierStopContract): string | null {
  // İptal ve hazırlanmamış durak önce gelir ve saatsizdir, çünkü ikisi bir olayın değil siparişin hâlinin adıdır.
  if (stop.cancelled) return t.day.stop.tagCancelled;
  if (stop.outcome === 'pending' && stop.awaitingPreparation) return t.day.stop.tagUnprepared;
  const tag =
    stop.outcome === 'delivered'
      ? isPartial(stop)
        ? t.day.stop.tagPartial
        : t.day.stop.tagDelivered
      : stop.outcome === 'unreachable'
        ? t.day.stop.tagUnreachable
        : stop.outcome === 'refused'
          ? t.day.stop.tagRefused
          : null;
  if (tag === null) return null;
  return stop.settledAt === null ? tag : fillCopy(t.day.stop.tagAt, { tag, time: timeOf(stop.settledAt) });
}

/** Durağın alt satırı: sonuç etikette yazdığı için burada teslimde "ne bıraktım, ne aldım", sorunda malın akıbeti anlatılır. */
export function stopSubtitle(stop: CourierStopContract): { text: string; tone: 'muted' | 'error' | 'terracotta' } {
  const channel = t.channel[stop.channel];
  // İptal edilmiş durakta tek söylenecek şey araçta kalan kutulardır; müşteri ve kanal "kime teslim" sorusunun cevabıdır ve o soru burada yok.
  if (stop.cancelled) {
    const boxesOnVan = stop.boxes.filter((box) => box.loadedAt !== null).length;
    return { text: fillCopy(t.day.stop.cancelledBoxes, { n: String(boxesOnVan) }), tone: 'error' };
  }
  if (stop.outcome === 'delivered') {
    // Kısmi durağın borcu düzeltmeyle düşmüştür; iki sayıyı yan yana yazmak kuryeye hangisinin geçerli olduğunu sordururdu.
    if (isPartial(stop)) {
      const { total, done } = partialCounts(stop);
      return {
        text: [
          fillCopy(t.day.stop.partialLine, { total: String(total), done: String(done) }),
          fillCopy(t.day.stop.leftInVanQty, { n: String(total - done) }),
        ].join(' · '),
        tone: 'terracotta',
      };
    }
    const parts = [fillCopy(t.day.stop.items, { n: String(stop.itemCount) })];
    // Kapıda alınan para yöntemiyle yazılır, çünkü kurye akşam kasayı yöntem yöntem sayar; yöntem bilinmiyorsa satır yazılmaz.
    const collected = stop.payment.collectedAtDoorCents;
    const method = stop.payment.expectedMethod;
    if (collected !== null && method !== null) {
      parts.push(fillCopy(t.day.stop.collected, { method: t.method[method], amount: money(collected) }));
    }
    const due = stop.payment.dueAmountCents;
    if (due !== null) {
      parts.push(fillCopy(t.day.stop.deliveredDebt, { amount: money(due) }));
      return { text: parts.join(' · '), tone: 'terracotta' };
    }
    return { text: parts.join(' · '), tone: 'muted' };
  }
  if (stop.outcome === 'unreachable' || stop.outcome === 'refused') {
    /* Kuryenin kendi notu önce gelir. Malın akıbeti iki sonuçta farklıdır: ulaşılamayanda mal araçta kalır ve kapanışta karara düşer,
       reddedilende depoya döner. */
    const note = stop.outcomeNote;
    const parts =
      stop.outcome === 'unreachable'
        ? [note ?? t.day.stop.unreachable, fillCopy(t.day.stop.leftInVanItems, { n: String(stop.itemCount) }), t.day.stop.closeDecides]
        : [note ?? t.day.stop.refused, fillCopy(t.day.stop.backToWarehouse, { n: String(stop.itemCount) })];
    return { text: parts.join(' · '), tone: 'error' };
  }

  const parts = [stop.customerName, channel, fillCopy(t.day.stop.items, { n: String(stop.itemCount) })];
  if (stop.attempts > 0) parts.push(fillCopy(t.day.stop.attempt, { n: String(stop.attempts + 1) }));
  if (stop.payment.dueAmountCents === null) parts.push(t.day.stop.noDebt);
  return { text: parts.join(' · '), tone: 'muted' };
}
