import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from '@supabase/supabase-js';

import { endDeviceSession, endRejectedSession, isDeadSessionAnswer, onSessionRejected } from './session-end';
import { clearStoredSession } from './session-store';
import { getSupabase } from './supabase';

/*
  OTURUMUN SONU (21.304) — bu dosyanın koruduğu iki söz:

  1. Oturumu kapatan KANIT 401 değil, auth sunucusunun tazeleme cevabıdır. Ağ kesintisi, 5xx, hız
     sınırı oturumu kapatmaz — kapatsaydı bir auth kesintisi bütün kuryeleri rota ortasında dışarı
     atardı. Liste gevşetilirse aşağıdaki "ölüm DEĞİL" satırları kırmızı yanar.
  2. Reddedilen oturumun sonu YETKİLİ İSTEK ATMAZ. Gönüllü çıkışın ilk adımı (push kaydını bırakmak)
     buraya taşınırsa ölü jetonla atılan istek 401 alır, `authorizedFetch` yine bu kapıya gelir —
     döngü. Son test o adımın buraya sızmasını yakalar.
*/

jest.mock('./supabase', () => ({ getSupabase: jest.fn() }));
jest.mock('./session-store', () => ({ clearStoredSession: jest.fn(async () => undefined) }));

const supabaseSignOut = jest.fn();

beforeEach(() => {
  supabaseSignOut.mockReset();
  supabaseSignOut.mockResolvedValue({ error: null });
  (clearStoredSession as jest.Mock).mockClear();
  (getSupabase as jest.Mock).mockReturnValue({ auth: { signOut: supabaseSignOut } });
});

describe('isDeadSessionAnswer — ölümün kanıtı auth sunucusunun cevabı', () => {
  it.each(['refresh_token_not_found', 'refresh_token_already_used', 'session_expired', 'user_banned'])(
    '%s → oturum ölü',
    (code) => {
      expect(isDeadSessionAnswer(new AuthApiError('ret', 400, code))).toBe(true);
    },
  );

  it('hız sınırı (429) ölüm DEĞİL — tazeleme jetonu hâlâ geçerli olabilir', () => {
    expect(isDeadSessionAnswer(new AuthApiError('çok istek', 429, 'over_request_rate_limit'))).toBe(false);
  });

  it('auth sunucusuna ulaşılamadı (ağ / 502) ölüm DEĞİL — kesinti kuryeyi dışarı atmasın', () => {
    expect(isDeadSessionAnswer(new AuthRetryableFetchError('ağ yok', 0))).toBe(false);
    expect(isDeadSessionAnswer(new AuthRetryableFetchError('Bad Gateway', 502))).toBe(false);
  });

  it('cihazda zaten oturum yoksa kapatılacak bir şey yok', () => {
    expect(isDeadSessionAnswer(new AuthSessionMissingError())).toBe(false);
  });

  it('auth-js dışı hata ya da boş değer ölüm sayılmaz', () => {
    expect(isDeadSessionAnswer({ message: 'invalid refresh token' })).toBe(false);
    expect(isDeadSessionAnswer(null)).toBe(false);
  });
});

describe('endRejectedSession', () => {
  it('abone kapanıştan ÖNCE duyar — SIGNED_OUT geldiğinde sebep yerinde olsun', async () => {
    const order: string[] = [];
    supabaseSignOut.mockImplementation(async () => {
      order.push('signOut');
      return { error: null };
    });
    const release = onSessionRejected(() => order.push('abone'));

    await endRejectedSession();
    release();

    expect(order).toEqual(['abone', 'signOut']);
    expect(supabaseSignOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(clearStoredSession).toHaveBeenCalledTimes(1);
  });

  it('aynı anda düşen istekler TEK kapanışı paylaşır — ikinci SIGNED_OUT doğmaz', async () => {
    await Promise.all([endRejectedSession(), endRejectedSession(), endRejectedSession()]);

    expect(supabaseSignOut).toHaveBeenCalledTimes(1);
  });

  it('kapanış bitince yeni bir ret yeniden kapatır — tek uçuş kalıcı bir kilit değil', async () => {
    await endRejectedSession();
    await endRejectedSession();

    expect(supabaseSignOut).toHaveBeenCalledTimes(2);
  });

  it('bırakılan abone bir daha duymaz', async () => {
    const listener = jest.fn();
    const release = onSessionRejected(listener);
    release();

    await endRejectedSession();

    expect(listener).not.toHaveBeenCalled();
  });

  it('yetkili istek ATMAZ — push kaydı bırakılmaz, 401 → kapanış döngüsü kurulamaz', async () => {
    const original = globalThis.fetch;
    const fetchSpy = jest.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    try {
      await endRejectedSession();
    } finally {
      globalThis.fetch = original;
    }

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('endDeviceSession', () => {
  it('supabase temizliği düşse bile depo boşalır, hata Result ile döner (yutulmaz)', async () => {
    supabaseSignOut.mockResolvedValueOnce({ error: { message: 'ağ yok' } });

    const result = await endDeviceSession();

    expect(result.error).toBe('ağ yok');
    expect(clearStoredSession).toHaveBeenCalledTimes(1);
  });
});
