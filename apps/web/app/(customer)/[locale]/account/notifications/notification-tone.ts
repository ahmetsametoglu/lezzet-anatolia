import type { NotificationVisualTone } from '@lezzet/i18n';

/** Semantik ton → müşteri paleti; sipariş durum haplarıyla aynı aileler. */
export const TONE_BG: Record<NotificationVisualTone, string> = {
  positive: 'bg-olive-bg',
  attention: 'bg-honey-bg',
  issue: 'bg-terracotta-bg',
  neutral: 'bg-sand-100',
};

export const TONE_TEXT: Record<NotificationVisualTone, string> = {
  positive: 'text-olive-dark',
  attention: 'text-honey',
  issue: 'text-terracotta-bright',
  neutral: 'text-muted',
};
