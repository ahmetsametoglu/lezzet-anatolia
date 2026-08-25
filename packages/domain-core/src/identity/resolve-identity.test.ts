import { describe, expect, it } from 'vitest';
import { resolveIdentity } from './resolve-identity';

describe('kimlik çözümü (03.9)', () => {
  it('telefon eşleşirse o müşteriye bağlanır (WhatsApp yolu)', () => {
    const r = resolveIdentity({ phone: '06 12 34 56 78' }, { byPhone: 'c1' });
    expect(r).toEqual({ action: 'attach', customerId: 'c1', normalizedPhone: '+33612345678', email: null });
  });

  it('e-posta eşleşirse o müşteriye bağlanır (web yolu)', () => {
    const r = resolveIdentity({ email: 'Ayse@Example.COM ' }, { byEmail: 'c2' });
    expect(r).toMatchObject({ action: 'attach', customerId: 'c2', email: 'ayse@example.com' });
  });

  it('iki anahtar AYNI müşteriye çıkarsa sorun yok — aynı kişi iki yüzeyden geldi', () => {
    const r = resolveIdentity({ phone: '0612345678', email: 'a@b.fr' }, { byPhone: 'c1', byEmail: 'c1' });
    expect(r).toMatchObject({ action: 'attach', customerId: 'c1' });
  });

  it('iki anahtar FARKLI müşteriye çıkarsa sessizce seçim yapılmaz — admin birleştirir', () => {
    const r = resolveIdentity({ phone: '0612345678', email: 'a@b.fr' }, { byPhone: 'c1', byEmail: 'c2' });
    expect(r).toEqual({ action: 'conflict', customerIds: ['c1', 'c2'] });
  });

  it('eşleşme yoksa yeni kayıt açılır; telefon normalize edilmiş döner', () => {
    const r = resolveIdentity({ phone: '+33 6 12 34 56 78', phoneProven: true });
    expect(r).toEqual({ action: 'create', normalizedPhone: '+33612345678', email: null });
  });

  it('oturum sahibi ÜÇÜNCÜ anahtardır — trigger profili açmışsa ona bağlanılır', () => {
    // Google ile giren kullanıcının telefonu/e-postası elimizde olmayabilir; auth bağı yeter.
    const r = resolveIdentity({ authUserId: 'u1' }, { byAuthUser: 'c9' });
    expect(r).toMatchObject({ action: 'attach', customerId: 'c9' });
  });

  it('oturum sahibi BAŞKA profile bağlıysa çakışmadır — aynı auth iki profile yazılamaz', () => {
    // Telefonla açılmış WhatsApp taslağı + trigger'ın e-postayla açtığı profil: iki ayrı kayıt.
    const r = resolveIdentity({ phone: '0612345678', authUserId: 'u1' }, { byPhone: 'c1', byAuthUser: 'c2' });
    expect(r).toEqual({ action: 'conflict', customerIds: ['c2', 'c1'] });
  });

  it('üç anahtar üç ayrı kayda düşebilir — hepsi bildirilir', () => {
    const r = resolveIdentity(
      { phone: '0612345678', email: 'a@b.fr', authUserId: 'u1' },
      { byPhone: 'c1', byEmail: 'c2', byAuthUser: 'c3' },
    );
    expect(r).toEqual({ action: 'conflict', customerIds: ['c3', 'c1', 'c2'] });
  });

  it('anahtar yoksa kimlik kurulamaz', () => {
    expect(resolveIdentity({})).toEqual({ action: 'insufficient' });
    expect(resolveIdentity({ phone: 'abc' })).toEqual({ action: 'insufficient' }); // normalize edilemedi
  });

  it('Alman numarası varsayılan ülkeyle çözülür', () => {
    const r = resolveIdentity({ phone: '0170 1234567', phoneProven: true, defaultCountry: 'DE' });
    expect(r).toMatchObject({ action: 'create', normalizedPhone: '+491701234567' });
  });
});

/**
 * 04.10 — kanıt kuralı. Ayrım OKUMADA değil YAZMADA: bağlanmak serbest, kimlik AÇMAK kanıt ister.
 * Kapatılan açık, hesap kartına ya da checkout formuna yazılan bir numaranın kimlik kurabilmesiydi.
 */
describe('kanıtsız numara kimlik DOĞURAMAZ (04.10)', () => {
  it('kanıtsız numara tek anahtarken yeni kayıt AÇILMAZ — önceden sahiplenme kapısı burada kapanır', () => {
    // Eski davranış `create` idi ve açığın kendisiydi: numarayı yazan onu kilitliyordu.
    expect(resolveIdentity({ phone: '0612345678' })).toEqual({ action: 'insufficient' });
    // Bayrağın YOKLUĞU ile açıkça `false` verilmesi aynı yere düşmeli — varsayılan güvenli taraf.
    expect(resolveIdentity({ phone: '0612345678', phoneProven: false })).toEqual({ action: 'insufficient' });
  });

  it('KANITLI numara açar — imzalı webhooktan gelen mesaj zilyetliği gösterir', () => {
    expect(resolveIdentity({ phone: '0612345678', phoneProven: true })).toMatchObject({ action: 'create' });
  });

  it('kanıtsız numara MEVCUT kayda bağlanabilir — eşleşme defterden geliyor, yeni iddia değil', () => {
    // Operatörün klavyesinden geçen numara kanıt değil; ama `byPhone` kanıt defterinden (04.10'un
    // `customer_phone` tablosu) geliyor ve o satırın kendisi zaten bir kanıt. Bağı kurmayı
    // reddetmek, elimizdeki doğru cevabı kullanmamak olurdu.
    expect(resolveIdentity({ phone: '0612345678' }, { byPhone: 'c1' })).toMatchObject({ action: 'attach', customerId: 'c1' });
  });

  it('kanıtsız numara + e-posta: kayıt E-POSTAYLA açılır ve numara yine de normalize döner', () => {
    // İkinci anahtar kanıtlı olduğu için kayıt açılabilir; numara İLETİŞİM bilgisi olarak taşınır.
    expect(resolveIdentity({ phone: '0612345678', email: 'a@b.fr' })).toEqual({
      action: 'create',
      normalizedPhone: '+33612345678',
      email: 'a@b.fr',
    });
  });

  it('çakışma kararı kanıttan ÖNCE gelir — iki kayda çıkan anahtarlar sessizce birleştirilmez', () => {
    // Kanıtsız olmak çakışmayı "yok" saymaz: iki ayrı kayda düşen anahtarlar hâlâ insana gider.
    expect(resolveIdentity({ phone: '0612345678', email: 'a@b.fr' }, { byPhone: 'c1', byEmail: 'c2' })).toEqual({
      action: 'conflict',
      customerIds: ['c1', 'c2'],
    });
  });
});
