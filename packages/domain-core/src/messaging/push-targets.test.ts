import { describe, expect, it } from 'vitest';
import { choosePushTargets } from './push-targets';

const now = new Date('2026-09-29T12:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

const ios = (lastSeenAt: string) => ({ platform: 'ios' as const, token: 'ExponentPushToken[a]', p256dh: null, auth: null, lastSeenAt });
const web = { platform: 'web' as const, token: 'https://fcm.googleapis.com/fcm/send/x', p256dh: 'p', auth: 'a', lastSeenAt: daysAgo(90) };

describe('choosePushTargets', () => {
  it('etkin native uygulama varken tarayıcıya gitmez', () => {
    expect(choosePushTargets([ios(daysAgo(2)), web], now)).toEqual({ native: ['ExponentPushToken[a]'], web: [] });
  });

  it('native uygulama süreyi aşınca haber tarayıcıya gider', () => {
    expect(choosePushTargets([ios(daysAgo(31)), web], now)).toEqual({
      native: [],
      web: [{ endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'p', auth: 'a' } }],
    });
  });

  it('etkin cihaz yoksa ikisi de boş kalır ve sıra kanal listesine düşer', () => {
    expect(choosePushTargets([ios(daysAgo(31))], now)).toEqual({ native: [], web: [] });
  });
});
