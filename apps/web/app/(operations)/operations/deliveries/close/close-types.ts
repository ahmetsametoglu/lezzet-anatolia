import type { DayCloseDraft } from '@/lib/courier/day-close';

// Gün kapanışı ekranının sözleşmesi (11.6).

/** Kapıda toplanan üç yöntem — kapanışın mutabakat ekseni. Online/havale kuryenin eline girmez. */
export const CLOSE_METHODS = ['cash', 'card', 'cheque'] as const;
export type CloseMethod = (typeof CLOSE_METHODS)[number];

/** Kuryenin saydığı tutarlar (**euro** — kutu euro konuşur, sistem cent; STACK §8). */
export type CountedDraft = Record<CloseMethod, number | null>;

/**
 * Tip burada durur, istemcide değil: düzen dosyası tipi istemciden alsaydı istemci de düzeni içe
 * aktardığı için halka doğardı (`no-circular`).
 */
export interface DayCloseViewProps {
  draft: DayCloseDraft;
  counted: CountedDraft;
  onCounted: (method: CloseMethod, euros: number | null) => void;
  note: string;
  onNote: (note: string) => void;
  busy: boolean;
  error: string | null;
  onClose: () => void;
}
