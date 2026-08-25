import { describe, expect, it } from 'vitest';
import { anchorStateOf, canOpenHistory, needsChallenge, sixDigitCodeIn } from './anchor';

/**
 * Kimlik çapası — saf kararlar (04.10 · DOMAIN §10).
 *
 * Çivilenen şey dört cümle:
 *   1. Çapa hâli ÜÇ kaynaktan türer, saklanmaz.
 *   2. Kapı çapanın VARLIĞINA bakar — sipariş almak geçmiş gerektirmez.
 *   3. İki tetik birbirinin YERİNE GEÇMEZ (`failed` erken, sessizlik geç).
 *   4. Altı hane rakam sınırıyla çevrili okunur — yedi haneli bir referans kod sayılmaz.
 */
const BOS = { authUserId: null, emailAnchoredAt: null, securityCodeHash: null };

describe('çapa hâli', () => {
  it('OTP girişi tek başına e-posta çapasıdır — o kutuya gelen kodla girilmiştir', () => {
    expect(anchorStateOf({ ...BOS, authUserId: 'u1' })).toBe('email');
  });

  it('çapraz kanal damgası da e-posta çapasıdır — farkı TAŞIYICI, gücü değil', () => {
    expect(anchorStateOf({ ...BOS, emailAnchoredAt: '2026-08-25T10:00:00.000Z' })).toBe('email');
  });

  it('yalnız kod varsa çapa KOD', () => {
    expect(anchorStateOf({ ...BOS, securityCodeHash: 'abc' })).toBe('code');
  });

  it('hiçbiri yoksa çapa YOK — ve bu bir hata değil, olağan başlangıç hâli', () => {
    expect(anchorStateOf(BOS)).toBe('none');
  });

  it('e-posta koddan ÖNCE gelir — ikisi bir arada bulunmamalı ama bulunursa güçlü olan kazanır', () => {
    expect(anchorStateOf({ authUserId: null, emailAnchoredAt: '2026-08-25T10:00:00.000Z', securityCodeHash: 'abc' })).toBe('email');
  });
});

describe('kapı', () => {
  it('çapası olan geçmişini açabilir; olmayan AÇAMAZ', () => {
    expect(canOpenHistory('email')).toBe(true);
    expect(canOpenHistory('code')).toBe(true);
    expect(canOpenHistory('none')).toBe(false);
  });
});

describe('tetik', () => {
  const NOW = new Date('2026-08-25T12:00:00.000Z');
  const temel = { state: 'code' as const, lastSeenAt: NOW.toISOString(), deliveryFailed: false, silenceDays: 90, now: NOW };

  it('taşıyıcı BEYANI erken tetiktir — sessizlik eşiği beklenmez', () => {
    // `failed` bir tahmin değil: numara kapanmış ya da bizi engellemiş. Bağ zaten şüpheli.
    expect(needsChallenge({ ...temel, deliveryFailed: true })).toBe('delivery_failed');
  });

  it('eşiği aşan sessizlik GEÇ tetiktir', () => {
    const eski = new Date(NOW.getTime() - 91 * 86_400_000).toISOString();
    expect(needsChallenge({ ...temel, lastSeenAt: eski })).toBe('silence');
  });

  it('eşiğin altındaki sessizlik tetik DEĞİLDİR — boşluğun kendisi teşhis değil', () => {
    const yakin = new Date(NOW.getTime() - 89 * 86_400_000).toISOString();
    expect(needsChallenge({ ...temel, lastSeenAt: yakin })).toBeNull();
  });

  it('eşiğin TAM üstü tetikler — sınır dışarıda değil içeridedir', () => {
    const tam = new Date(NOW.getTime() - 90 * 86_400_000).toISOString();
    expect(needsChallenge({ ...temel, lastSeenAt: tam })).toBe('silence');
  });

  it('ÇAPASI OLMAYANA sorulmaz — cevabı olmayan bir soru sorulmuş olurdu', () => {
    expect(needsChallenge({ ...temel, state: 'none', deliveryFailed: true })).toBeNull();
  });

  it('hiç görülmemiş numarada sessizlik ÖLÇÜLEMEZ — ölçülemeyen değer tetik saymaz', () => {
    // "Ölçülemeyen değer SIFIR değildir" (CLAUDE §1): damgasız satırı "çok eski" saymak, ilk
    // mesajını yazan müşteriye kod sordururdu.
    expect(needsChallenge({ ...temel, lastSeenAt: null })).toBeNull();
  });
});

describe('altı hane ayrıştırma', () => {
  it('cümlenin içinden okur', () => {
    expect(sixDigitCodeIn('kod 482917 galiba')).toBe('482917');
  });

  it('baştaki sıfırlar korunur — kod bir SAYI değil, bir dizedir', () => {
    expect(sixDigitCodeIn('000123')).toBe('000123');
  });

  it('YEDİ haneli sayı kod SAYILMAZ — sipariş referansı bir kodu doğrulamamalı', () => {
    expect(sixDigitCodeIn('1234567')).toBeNull();
    expect(sixDigitCodeIn('siparişim 9876543')).toBeNull();
  });

  it('beş hane de değildir; metinsiz mesaj da değildir', () => {
    expect(sixDigitCodeIn('12345')).toBeNull();
    expect(sixDigitCodeIn(null)).toBeNull();
    expect(sixDigitCodeIn('merhaba')).toBeNull();
  });
});
