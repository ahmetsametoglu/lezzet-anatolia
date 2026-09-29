import { describe, expect, it } from 'vitest';
import { WebPushSubscriptionSchema } from './push-device.schema';

const keys = { p256dh: 'p', auth: 'a' };
const accepts = (endpoint: string) => WebPushSubscriptionSchema.safeParse({ endpoint, keys }).success;

describe('WebPushSubscriptionSchema', () => {
  it('tarayıcıların bildirim servislerini kabul eder', () => {
    expect(accepts('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(accepts('https://web.push.apple.com/QAbc')).toBe(true);
    expect(accepts('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true);
    expect(accepts('https://wns2-par02p.notify.windows.com/w/?token=abc')).toBe(true);
  });

  it('sunucunun istek atacağı başka adresi reddeder', () => {
    expect(accepts('http://fcm.googleapis.com/fcm/send/abc')).toBe(false);
    expect(accepts('https://fcm.googleapis.com.evil.test/fcm/send/abc')).toBe(false);
    expect(accepts('https://evilfcm.googleapis.com.test/abc')).toBe(false);
    expect(accepts('https://127.0.0.1/abc')).toBe(false);
    expect(accepts('https://supabase-kong:8000/rest/v1/')).toBe(false);
  });
});
