import type { Locale } from './locale';
import checkout from './customer/checkout.json';

type ConfirmedCopy = (typeof checkout)[Locale]['confirmed'];

/** Kesinleşmemiş onay hâlinin başlık ve cümle anahtarı; kesinleşmiş hâlin metni yüzeyin kendisinde (kişisel başlık, not). */
const PHASE_KEYS = {
  refunded: ['refunded', 'refundedBody'],
  failed: ['failed', 'failedBody'],
  paid: ['paid', 'paidBody'],
  processing: ['pending', 'processingBody'],
  pending: ['pending', 'pendingBody'],
  incomplete: ['incomplete', 'incompleteBody'],
} as const satisfies Record<string, readonly [keyof ConfirmedCopy, keyof ConfirmedCopy]>;

/** Onay ekranının kesinleşmemiş hâl metni; hâl `confirmationPhaseOf`tan (domain-core) gelir, web ve native aynı cümleyi okur. */
export function confirmationCopy(locale: Locale, phase: keyof typeof PHASE_KEYS): { title: string; body: string } {
  const c = checkout[locale].confirmed;
  const [title, body] = PHASE_KEYS[phase];
  return { title: c[title], body: c[body] };
}
