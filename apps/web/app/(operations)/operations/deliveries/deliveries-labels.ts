import type { StopOutcome } from '@/lib/courier/day';
import type { OpsTone } from '@/components/operation/ui/tone';

// Kurye gün ekranının SÖZLÜĞÜ. Bu yüzeyin kullanıcısı sahada, telefonda, çoğu zaman ayaküstü —
// cümleler kısa ve KAPIDAKİ dille kurulu: "bekliyor" değil sistemin `ready`'si, "ulaşılamadı" değil
// `out_for_delivery → ready` geçişi. İç terim hiç görünmüyor.

/**
 * Durağın hâli — kuryenin gördüğü, sistemin `status`'ü değil.
 *
 * Motorun künyesi ayrımı yazıyor: "ulaşılamadı" ile "henüz sıra gelmedi" **ikisi de `ready`**;
 * fark geçiş geçmişinden türetiliyor. Ekran o türetimi tekrarlamıyor, sonucunu okuyor.
 */
export const OUTCOME_VIEW: Record<StopOutcome, { label: string; tone: OpsTone }> = {
  pending: { label: 'Bekliyor', tone: 'neutral' },
  delivered: { label: 'Teslim edildi', tone: 'olive' },
  // Amber çünkü bu bir BİTİŞ değil, bir askı: mal ayrılmış kalıyor ve kurye gün içinde geri dönebilir.
  unreachable: { label: 'Ulaşılamadı', tone: 'amber' },
  // Kırmızı ama bir suçlama değil: mal depoya döndü, günün planı değişti.
  refused: { label: 'Reddedildi', tone: 'red' },
};

/** Sonuçlanmış mı — ilerleme sayacı ve sıralama bunu soruyor. */
export function isSettled(outcome: StopOutcome): boolean {
  return outcome !== 'pending';
}

export const NOTES = {
  emptyDay:
    'Bugün size atanmış teslimat yok. Plan gün içinde değişebilir — sevkiyat yeni durak eklerse listeyi yenileyince görünür.',
  allDone: 'Günün bütün durakları sonuçlandı. Kasa mutabakatı için gün kapanışına geçebilirsiniz.',
  /** Ulaşılamayanlar listede KALIR — kaybolmaları, geri dönülecek adresi unutturur. */
  retryHint: 'Ulaşılamayan duraklar listede kalır; gün içinde geri dönebilirsiniz.',
  /** Kapıda ödeme yoksa para hiç konuşulmaz (tasarım §2). */
  prepaid: 'Ödendi — kapıda para konuşulmaz',
} as const;

/** Kapıda beklenen ödeme yöntemi — kuryenin hazırlığı buna göre (üstü var mı, POS gerekir mi). */
export const METHOD_LABEL: Record<string, string> = {
  cash: 'nakit',
  card: 'kart',
  check: 'çek',
  transfer: 'havale',
  online: 'online',
};
