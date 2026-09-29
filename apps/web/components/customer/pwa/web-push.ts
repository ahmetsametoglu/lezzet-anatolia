// Tarayıcı aboneliğinin istemci yarısı; kayıt ve silme sunucu eylemlerindedir.

import { registerWebPushAction } from '@/lib/push/actions';

const PUBLIC_KEY = process.env.NEXT_PUBLIC_WEB_PUSH_PUBLIC_KEY ?? '';

/** iPhone'da `PushManager` yalnız ana ekrana kurulu uygulamada tanımlıdır; Safari sekmesinde kart hiç çizilmez. */
export function webPushSupported(): boolean {
  return PUBLIC_KEY !== '' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function currentWebPushSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration('/');
  return (await registration?.pushManager.getSubscription()) ?? null;
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=');
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** İzin istemi yalnız müşterinin bastığı düğmeden açılır; tarayıcılar kendiliğinden açılan istemi engeller. */
export async function subscribeWebPush(): Promise<PushSubscription | null> {
  if ((await Notification.requestPermission()) !== 'granted') return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(PUBLIC_KEY) });
}

/** Abone tarayıcı her açılışta oturumdaki müşteriye yeniden kaydolur; yeniden giriş ve tarayıcının yenilediği abonelik böyle tutar. */
export async function syncWebPushSubscription(): Promise<void> {
  if (!webPushSupported() || Notification.permission !== 'granted') return;
  const subscription = await currentWebPushSubscription();
  if (subscription) await registerWebPushAction(subscription.toJSON());
}
