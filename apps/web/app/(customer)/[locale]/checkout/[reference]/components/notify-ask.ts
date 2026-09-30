import type { WebPushMode } from '@/components/customer/pwa/use-web-push.hook';

export type NotifyAskState = 'hidden' | 'ask' | 'done' | 'failed';

/**
 * Teşekkür sayfası yalnız işe yarayacak anda sorar: sipariş kesinleşmişse, tarayıcı destekliyorsa ve izin reddedilmemişse. Zaten açık
 * bildirim bir daha sorulmaz; "açık" cümlesi yalnız bu sayfada açılmışsa çizilir.
 */
export function notifyAskState(input: { placed: boolean; mode: WebPushMode; on: boolean; asked: boolean; failed: boolean }): NotifyAskState {
  if (!input.placed || input.mode !== 'ready') return 'hidden';
  if (input.on) return input.asked ? 'done' : 'hidden';
  return input.failed ? 'failed' : 'ask';
}
