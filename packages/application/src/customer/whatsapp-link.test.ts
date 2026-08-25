import { afterAll, describe, expect, it } from 'vitest';
import { CustomerPhoneService, UserProfileService, serviceDb } from '@lezzet/database';
import { purgeTestData } from '@lezzet/database/testing';
import { consumeWhatsappLink, startWhatsappLink, waLinkTokenIn } from './whatsapp-link';

/**
 * **WhatsApp bağlama** (04.10) — hesabı müşterinin numarasına bağlayan jeton akışı. DOMAIN §10.
 *
 * Sınanan şey, akışın SÖZ VERDİĞİ dört şey:
 *   1. Jetonlu mesaj hesabı numaraya bağlar — kanıt satırı doğar.
 *   2. Jeton TEK KULLANIMLIK ve SÜRELİ; geçersiz jeton hiçbir şey açmaz.
 *   3. Numara bir TASLAĞA bağlıysa taslak hesaba birleşir — en sık hâl budur, kenar durum değil.
 *   4. Numara GERÇEK bir kayıttaysa birleştirme YOK; sessizce çevrilmez.
 */
const db = serviceDb();
const profiles = new UserProfileService(db);
const phones = new CustomerPhoneService(db);

const stamp = Date.now();
const profileIds: string[] = [];
let sira = 0;

function numara(): string {
  sira += 1;
  return `+336${String(stamp).slice(-6)}${String(sira).padStart(2, '0')}`;
}

async function musteri(ad: string, patch: { isDraft?: boolean } = {}): Promise<string> {
  const row = await profiles.insert({ name: `${ad} ${stamp}`, ...patch });
  profileIds.push(row.id);
  return row.id;
}

/** Düğmenin ürettiği mesajın aynısı: cümle + kod. Ayrıştırıcı gerçek girdiyle sınanmalı. */
const mesaj = (code: string): string => `Merhaba! Hesabımı WhatsApp numarama bağlamak istiyorum. ${code}`;

afterAll(async () => {
  await purgeTestData(db, { profileIds });
});

describe('jeton ayrıştırma', () => {
  it('cümlenin İÇİNDEN bulur — müşteri mesajı düzenleyebilir, kod yerinde kaldığı sürece çalışır', () => {
    expect(waLinkTokenIn('Merhaba, bağlamak istiyorum LA-WA-ABCDEFGH2345 teşekkürler')).toBe('ABCDEFGH2345');
  });

  it('küçük harfe DUYARSIZ — telefon klavyeleri ilk harfi büyütür, sonrası değişebilir', () => {
    expect(waLinkTokenIn('la-wa-abcdefgh2345')).toBe('ABCDEFGH2345');
  });

  it('kabuğu olmayan ya da eksik uzunluktaki dize jeton DEĞİLDİR', () => {
    expect(waLinkTokenIn('ABCDEFGH2345')).toBeNull(); // kabuk yok
    expect(waLinkTokenIn('LA-WA-ABCDEF')).toBeNull(); // 12 hane değil
    expect(waLinkTokenIn('sadece merhaba')).toBeNull();
    expect(waLinkTokenIn(null)).toBeNull();
  });
});

describe('bağlama', () => {
  it('jetonlu mesaj hesabı numaraya BAĞLAR ve kanıt satırı doğar', async () => {
    const id = await musteri('Bağlayan');
    const telefon = numara();

    const baslangic = await startWhatsappLink(db, id);
    expect(baslangic.status).toBe('ok');
    if (baslangic.status !== 'ok') return;

    const sonuc = await consumeWhatsappLink(db, telefon, mesaj(baslangic.code));
    expect(sonuc).toEqual({ status: 'linked', customerId: id });
    expect((await phones.findActive(telefon))?.customerId).toBe(id);
  });

  it('jeton TEK KULLANIMLIK — aynı kod ikinci kez hiçbir şey açmaz', async () => {
    const id = await musteri('Tek kullanım');
    const baslangic = await startWhatsappLink(db, id);
    if (baslangic.status !== 'ok') throw new Error('jeton üretilemedi');

    await consumeWhatsappLink(db, numara(), mesaj(baslangic.code));
    // İkinci deneme BAŞKA bir numaradan: tek kullanım olmasaydı, kodu gören biri kendi numarasını
    // bu hesaba yazdırırdı — yani hesap devralma.
    const yabanciNumara = numara();
    expect(await consumeWhatsappLink(db, yabanciNumara, mesaj(baslangic.code))).toEqual({ status: 'invalid' });
    expect(await phones.findActive(yabanciNumara)).toBeNull();
  });

  it('YENİ jeton öncekini geçersizler — ekranda görünmeyen bir kod geçerli kalmamalı', async () => {
    const id = await musteri('İki kez basan');
    const ilk = await startWhatsappLink(db, id);
    const ikinci = await startWhatsappLink(db, id);
    if (ilk.status !== 'ok' || ikinci.status !== 'ok') throw new Error('jeton üretilemedi');
    expect(ikinci.code).not.toBe(ilk.code);

    expect(await consumeWhatsappLink(db, numara(), mesaj(ilk.code))).toEqual({ status: 'invalid' });
    expect((await consumeWhatsappLink(db, numara(), mesaj(ikinci.code))).status).toBe('linked');
  });

  it('SÜRESİ GEÇMİŞ jeton bağlamaz ve satırdan silinir — ölü jeton indekste birikmemeli', async () => {
    const id = await musteri('Geciken');
    const baslangic = await startWhatsappLink(db, id);
    if (baslangic.status !== 'ok') throw new Error('jeton üretilemedi');

    // Süreyi geriye alıyoruz: 15 dakika beklemek testin işi değil, ölçtüğümüz şey KARARIN kendisi.
    await profiles.update({ id, waLinkExpiresAt: new Date(Date.now() - 1000).toISOString() });

    const telefon = numara();
    expect(await consumeWhatsappLink(db, telefon, mesaj(baslangic.code))).toEqual({ status: 'invalid' });
    expect(await phones.findActive(telefon)).toBeNull();
    expect((await profiles.getById(id))?.waLinkToken).toBeNull();
  });

  it('jetonsuz mesaj akışa HİÇ dokunmaz — gelen mesajların ezici çoğunluğu böyle', async () => {
    expect(await consumeWhatsappLink(db, numara(), 'Cuma için baklava var mı?')).toEqual({ status: 'none' });
  });
});

describe('numara başka kayıttaysa', () => {
  it('TASLAK sahipse taslak hesaba BİRLEŞİR — en sık hâl: önce yazdı, sonra kaydoldu', async () => {
    // Gerçek dünya sırası: müşteri bize yazar (taslak + kanıt doğar), sonra siteden hesap açar,
    // sonra "bağla"ya basar. Birleştirme olmasaydı akış tam işe yarayacağı yerde çalışmazdı.
    const telefon = numara();
    const taslak = await musteri('WhatsApp taslağı', { isDraft: true });
    await phones.recordProof(taslak, telefon);

    const hesap = await musteri('Web hesabı');
    const baslangic = await startWhatsappLink(db, hesap);
    if (baslangic.status !== 'ok') throw new Error('jeton üretilemedi');

    const sonuc = await consumeWhatsappLink(db, telefon, mesaj(baslangic.code));
    expect(sonuc).toEqual({ status: 'merged', customerId: hesap, mergedId: taslak });

    // Kanıt hesaba geçti, taslak KAPANDI (silinmedi — 0040'ın kuralı).
    expect((await phones.findActive(telefon))?.customerId).toBe(hesap);
    expect((await profiles.getById(taslak))?.mergedIntoId).toBe(hesap);
  });

  it('GERÇEK bir kayıt sahipse birleştirme YOK — iki gerçek kaydı otomatik birleştirmek geri alınamaz', async () => {
    const telefon = numara();
    const sahip = await musteri('Gerçek sahip'); // taslak değil
    await phones.recordProof(sahip, telefon);

    const isteyen = await musteri('Bağlamak isteyen');
    const baslangic = await startWhatsappLink(db, isteyen);
    if (baslangic.status !== 'ok') throw new Error('jeton üretilemedi');

    const sonuc = await consumeWhatsappLink(db, telefon, mesaj(baslangic.code));
    expect(sonuc).toEqual({ status: 'conflict', customerId: isteyen, holderId: sahip });

    // Bağ DEĞİŞMEDİ ve jeton yine düştü: başarısız deneme de bir kullanımdır.
    expect((await phones.findActive(telefon))?.customerId).toBe(sahip);
    expect((await profiles.getById(isteyen))?.waLinkToken).toBeNull();
  });

  it('numara ZATEN bu hesaba bağlıysa bağlama sorunsuz tekrarlanır', async () => {
    const id = await musteri('Tekrar bağlayan');
    const telefon = numara();
    await phones.recordProof(id, telefon);

    const baslangic = await startWhatsappLink(db, id);
    if (baslangic.status !== 'ok') throw new Error('jeton üretilemedi');
    expect(await consumeWhatsappLink(db, telefon, mesaj(baslangic.code))).toEqual({ status: 'linked', customerId: id });
  });
});
