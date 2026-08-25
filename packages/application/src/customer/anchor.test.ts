import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CustomerPhoneService, UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { answerEmailAnchor, issueSecurityCode, startEmailAnchor, verifySecurityCode, SECURITY_CODE_MAX_ATTEMPTS } from './anchor';

/**
 * **Kimlik çapası — kuruluş** (04.10 · DOMAIN §10).
 *
 * Sınanan şey, tasarımın güvenlik argümanının ta kendisi:
 *   1. **Sorgunun YÖNÜ** — numaradan kimliğe, kimlikten bekleyen adrese/koda. Koddan kimliğe ASLA.
 *   2. **Kod yalnız KENDİ numarasından geçerli** — başka hattan gelen doğru kod hiçbir şey açmaz.
 *   3. **İki çapa bir arada bulunmaz** — e-posta kanıtlanınca kod silinir.
 *   4. **Deneme tavanı** — 5'te kilitlenir; doğru cevap sayacı sıfırlar.
 *
 * `OTP_TEST_CODE` süreç genelinde bir değişkendir: okunur, kurulur, GERİ KONUR (CLAUDE §4b).
 * Onsuz kod bilinemezdi — kod hiçbir yere yazılmıyor (OBSERVABILITY §5) ve yazılmamalı.
 */
const db = serviceDb();
const profiles = new UserProfileService(db);
const phones = new CustomerPhoneService(db);

const stamp = Date.now();
const profileIds: string[] = [];
let sira = 0;

const KOD = '424242';
const kodYedegi = process.env.OTP_TEST_CODE;

function numara(): string {
  sira += 1;
  return `+336${String(stamp).slice(-6)}${String(sira).padStart(2, '0')}`;
}
const posta = (tag: string) => `capa-${tag}-${stamp}@ornek.test`;

/** Kanıtlı numarası olan müşteri — çapa akışının tek giriş yolu numaradır. */
async function musteri(ad: string): Promise<{ id: string; phone: string }> {
  const row = await profiles.insert({ name: `${ad} ${stamp}` });
  profileIds.push(row.id);
  const phone = numara();
  await phones.recordProof(row.id, phone);
  return { id: row.id, phone };
}

beforeAll(() => {
  process.env.OTP_TEST_CODE = KOD;
});

afterAll(async () => {
  if (kodYedegi === undefined) delete process.env.OTP_TEST_CODE;
  else process.env.OTP_TEST_CODE = kodYedegi;
  await purgeTestData(db, { profileIds });
});

describe('e-posta çapası', () => {
  it('kod adrese gider, cevap NUMARADAN döner — çapraz kanal kanıtı kurulur', async () => {
    const m = await musteri('Çapraz');
    const adres = posta('capraz');

    expect(await startEmailAnchor(db, m.id, adres)).toEqual({ status: 'ok', email: adres });
    expect(await answerEmailAnchor(db, m.phone, `kod ${KOD}`)).toEqual({ status: 'anchored', customerId: m.id, email: adres });

    const sonra = await profiles.getById(m.id);
    expect(sonra?.email).toBe(adres);
    expect(sonra?.emailAnchoredAt).not.toBeNull();
    // Bekleyen soru kapandı: aynı kod ikinci kez bir şey açmaz.
    expect(sonra?.anchorEmail).toBeNull();
  });

  it('BAŞKA numaradan gelen doğru kod HİÇBİR ŞEY açmaz — yön güvenliğin tamamıdır', async () => {
    // Kodu ele geçiren biri (mailden, omuz üstünden) onu kendi hattından yazarsa: o hat başka bir
    // kimliğe çözülür ve o kimliğin bekleyen sorusu yoktur. Zincir numarada başlıyor.
    const kurban = await musteri('Kurban');
    const saldirgan = await musteri('Yabancı hat');
    await startEmailAnchor(db, kurban.id, posta('kurban'));

    expect(await answerEmailAnchor(db, saldirgan.phone, KOD)).toEqual({ status: 'not_pending' });
    expect((await profiles.getById(kurban.id))?.emailAnchoredAt).toBeNull();
    expect((await profiles.getById(saldirgan.id))?.emailAnchoredAt).toBeNull();
  });

  it('BEKLEYEN soru yokken altı hane sessizce geçilir — tahmine ücretsiz tur açılmaz', async () => {
    const m = await musteri('Sorusuz');
    expect(await answerEmailAnchor(db, m.phone, `siparişim ${KOD}`)).toEqual({ status: 'not_pending' });
  });

  it('YANLIŞ kod kalan hakkı söyler ve çapayı kurmaz', async () => {
    const m = await musteri('Yanlış yazan');
    await startEmailAnchor(db, m.id, posta('yanlis'));

    const sonuc = await answerEmailAnchor(db, m.phone, '111111');
    expect(sonuc.status).toBe('wrong');
    expect((await profiles.getById(m.id))?.emailAnchoredAt).toBeNull();
    // Bekleyen soru DURUYOR: yanlış yazan müşteri doğrusunu yazabilmeli.
    expect((await profiles.getById(m.id))?.anchorEmail).not.toBeNull();
  });

  it('adres BAŞKA bir hesaptaysa otomatik birleştirme YOK — karar insana gider', async () => {
    // DOMAIN §10 bunu "buluşma" sayıyor ve doğru; ama iki GERÇEK kaydı otomatik birleştirmek geri
    // alınamaz. Bağlama jetonundaki (`whatsapp-link`) kuralın aynısı.
    const adres = posta('baskasinda');
    const sahip = await profiles.insert({ name: `Adresin sahibi ${stamp}`, email: adres });
    profileIds.push(sahip.id);

    const m = await musteri('Talip');
    await startEmailAnchor(db, m.id, adres);

    expect(await answerEmailAnchor(db, m.phone, KOD)).toEqual({ status: 'email_elsewhere', customerId: m.id, holderId: sahip.id });
    expect((await profiles.getById(m.id))?.emailAnchoredAt).toBeNull();
  });

  it('kartta BAŞKA adres varsa çapa onu değiştiremez — e-posta bir kez yazılır', async () => {
    const m = await musteri('Adresi olan');
    await profiles.update({ id: m.id, email: posta('eski') });

    expect(await startEmailAnchor(db, m.id, posta('yeni'))).toEqual({ status: 'email_locked' });
  });

  it('bozuk adres reddedilir; hiçbir satıra dokunulmaz', async () => {
    const m = await musteri('Bozuk adres');
    expect(await startEmailAnchor(db, m.id, 'merhaba')).toEqual({ status: 'invalid_email' });
    expect((await profiles.getById(m.id))?.anchorEmail).toBeNull();
  });
});

describe('güvenlik kodu', () => {
  it('kod verilir, KENDİ numarasından doğrulanır', async () => {
    const m = await musteri('Kodlu');
    const verilen = await issueSecurityCode(db, m.id);
    expect(verilen.status).toBe('ok');
    if (verilen.status !== 'ok') return;

    expect(verilen.code).toMatch(/^\d{6}$/);
    // Düz kod SAKLANMAZ: satırda yalnız özeti var.
    expect((await profiles.getById(m.id))?.securityCodeHash).not.toBe(verilen.code);
    expect(await verifySecurityCode(db, m.phone, `kodum ${verilen.code}`)).toEqual({ status: 'ok', customerId: m.id });
  });

  it('BAŞKA numaradan gelen doğru kod geçmez — kodun tek başına değeri sıfırdır', async () => {
    // DOMAIN §10: kodu okuyan biri (ör. admin ekranında) kullanmak için o hattı da elinde tutmak
    // zorunda. Aynı özellik oltalamayı da defeder.
    const m = await musteri('Kod sahibi');
    const yabanci = await musteri('Yabancı');
    const verilen = await issueSecurityCode(db, m.id);
    if (verilen.status !== 'ok') throw new Error('kod verilemedi');

    expect(await verifySecurityCode(db, yabanci.phone, verilen.code)).toEqual({ status: 'no_code' });
  });

  it('yanlış denemeler sayılır ve tavanda KİLİTLENİR', async () => {
    const m = await musteri('Deneyen');
    const verilen = await issueSecurityCode(db, m.id);
    if (verilen.status !== 'ok') throw new Error('kod verilemedi');
    const yanlis = verilen.code === '000000' ? '111111' : '000000';

    for (let i = 1; i < SECURITY_CODE_MAX_ATTEMPTS; i += 1) {
      expect(await verifySecurityCode(db, m.phone, yanlis)).toEqual({ status: 'wrong', remainingAttempts: SECURITY_CODE_MAX_ATTEMPTS - i });
    }
    expect(await verifySecurityCode(db, m.phone, yanlis)).toEqual({ status: 'locked' });
    // Kilitliyken DOĞRU kod da geçmez: tavan tahmine konan sınırdır, kapı kapanmıştır.
    expect(await verifySecurityCode(db, m.phone, verilen.code)).toEqual({ status: 'locked' });
  });

  it('DOĞRU cevap sayacı sıfırlar — tavan bir ceza değil, tahmin sınırı', async () => {
    const m = await musteri('Düzelten');
    const verilen = await issueSecurityCode(db, m.id);
    if (verilen.status !== 'ok') throw new Error('kod verilemedi');
    const yanlis = verilen.code === '000000' ? '111111' : '000000';

    await verifySecurityCode(db, m.phone, yanlis);
    await verifySecurityCode(db, m.phone, verilen.code);
    expect((await profiles.getById(m.id))?.securityCodeAttempts).toBe(0);
  });

  it('E-POSTA çapası kurulunca kod SİLİNİR — iki anahtar bir arada bulunmaz', async () => {
    const m = await musteri('İkisi de');
    await issueSecurityCode(db, m.id);
    expect((await profiles.getById(m.id))?.securityCodeHash).not.toBeNull();

    await startEmailAnchor(db, m.id, posta('ikisi'));
    expect((await answerEmailAnchor(db, m.phone, KOD)).status).toBe('anchored');

    const sonra = await profiles.getById(m.id);
    expect(sonra?.securityCodeHash).toBeNull();
    expect(sonra?.securityCodeAttempts).toBe(0);
  });

  it('çapası olana ikinci çapa kurulmaz', async () => {
    const m = await musteri('Zaten çapalı');
    await startEmailAnchor(db, m.id, posta('zaten'));
    await answerEmailAnchor(db, m.phone, KOD);

    expect(await issueSecurityCode(db, m.id)).toEqual({ status: 'already_anchored' });
    expect(await startEmailAnchor(db, m.id, posta('zaten2'))).toEqual({ status: 'already_anchored' });
  });
});
