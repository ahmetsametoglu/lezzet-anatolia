import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CategoryService,
  ConversationService,
  CustomerPhoneService,
  EmailVerificationService,
  OrderService,
  ProductService,
  UserProfileService,
  serviceDb,
} from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import type { Order } from '@lezzet/types';
import { recordInboundMessage } from '../messaging/record';
import type { MessageSender } from '../messaging/send';
import {
  anchorGateOf,
  answerEmailAnchor,
  issueAndSendSecurityCode,
  issueSecurityCode,
  offerAnchorIfDue,
  raiseChallengeIfDue,
  startEmailAnchor,
  verifySecurityCode,
  SECURITY_CODE_MAX_ATTEMPTS,
} from './anchor';

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
const conversations = new ConversationService(db);

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

/**
 * **Tetik ve kapı** (04.10 · DOMAIN §10) — çapayı KURMAK ayrı, dönüşte SORMAK ayrı.
 *
 * Buradaki dört iddia tasarımın işleyen yarısı:
 *   1. **Boşluk yalnız kanıt tazelenmeden ÖNCE görünür** — soru o anda açılmazsa bir daha açılamaz.
 *   2. **Çapası olmayana soru sorulmaz** — cevabı olmayan soru sormak müşteriyi yorar, kapı zaten kapalı.
 *   3. **Soru bir kez açılır** — her mesajda yenilenseydi, e-posta yolunda müşterinin elindeki kod
 *      her seferinde ölürdü.
 *   4. **Doğru cevap kapıyı açar** — ayrı bir "kapat" adımı yok.
 */
describe('kimlik sorusu: tetik ve kapı', () => {
  /** Tazelemeden ÖNCEKİ kanıt satırı — çağıranın `recordProof`tan aldığı `previous`. */
  const gecmis = (row: Awaited<ReturnType<typeof phones.findActive>>, gunOnce: number) => ({
    ...row!,
    lastSeenAt: new Date(Date.now() - gunOnce * 86_400_000).toISOString(),
  });

  it('uzun sessizlik sonrası dönüşte soru AÇILIR ve kapı kapanır', async () => {
    const m = await musteri('Sessiz');
    await issueSecurityCode(db, m.id); // 6 haneli çapa: e-posta bağlamamış müşteri
    const profile = (await profiles.getById(m.id))!;

    expect(await anchorGateOf(db, m.id)).toMatchObject({ state: 'code', open: true, ask: null });

    const row = await phones.findActive(m.phone);
    expect(await raiseChallengeIfDue(db, { profile, previous: gecmis(row, 200) })).toBe('silence');
    expect(await anchorGateOf(db, m.id)).toMatchObject({ state: 'code', open: false, ask: 'code' });
  });

  it('taşıyıcının `failed` beyanı ERKEN tetiktir — sessizliği beklemez ve damga temizlenir', async () => {
    const m = await musteri('Ulaşılamayan');
    await issueSecurityCode(db, m.id);
    const profile = (await profiles.getById(m.id))!;

    // Taşıyıcı "ulaşamadım" dedi; numara daha DÜN görülmüş olsa bile bağ şüpheli.
    expect(await phones.markDelivery(m.phone, true)).not.toBeNull();
    const row = await phones.findActive(m.phone);
    expect(row?.deliveryFailedAt).not.toBeNull();

    expect(await raiseChallengeIfDue(db, { profile, previous: gecmis(row, 1) })).toBe('delivery_failed');
    // Sinyal soruya dönüştü: damga silinmeli, yoksa cevaptan sonraki ilk mesajda soru yeniden doğar.
    expect((await phones.findActive(m.phone))?.deliveryFailedAt).toBeNull();
  });

  it('başarılı teslim, önceki `failed` damgasını ÇÜRÜTÜR', async () => {
    const m = await musteri('Geri dönen hat');
    await phones.markDelivery(m.phone, true);
    await phones.markDelivery(m.phone, false);
    expect((await phones.findActive(m.phone))?.deliveryFailedAt).toBeNull();
  });

  it('ÇAPASIZ müşteriye soru sorulmaz — ama kapı da hiç açılmaz', async () => {
    const m = await musteri('Çapasız');
    const profile = (await profiles.getById(m.id))!;
    const row = await phones.findActive(m.phone);

    expect(await raiseChallengeIfDue(db, { profile, previous: gecmis(row, 400) })).toBeNull();
    expect((await profiles.getById(m.id))?.challengeReason).toBeNull();
    // Sorulacak bir şey yok, ama geçmiş de açılmıyor: çapa yokluğu kapının kendisi.
    expect(await anchorGateOf(db, m.id)).toMatchObject({ state: 'none', open: false, ask: null });
  });

  it('bekleyen soru varken YENİDEN sorulmaz — ikinci mesaj yeni bir kod üretmez', async () => {
    const m = await musteri('İki mesaj');
    await issueSecurityCode(db, m.id);
    const row = await phones.findActive(m.phone);

    const ilk = await raiseChallengeIfDue(db, { profile: (await profiles.getById(m.id))!, previous: gecmis(row, 200) });
    const damga = (await profiles.getById(m.id))?.challengeRaisedAt;
    const ikinci = await raiseChallengeIfDue(db, { profile: (await profiles.getById(m.id))!, previous: gecmis(row, 200) });

    expect(ilk).toBe('silence');
    expect(ikinci).toBe('silence');
    expect((await profiles.getById(m.id))?.challengeRaisedAt).toBe(damga); // soru yenilenmedi
  });

  it('e-posta çapalı müşteride soruyu sormak, KODU GÖNDERMEKTİR', async () => {
    // Çapa doğrudan damgalanıyor: gerçek hayatta bu hâl aylar önce kurulmuş olur (ya çapraz kanal
    // kanıtıyla ya posta kutusuna gelen kodla girişle). `startEmailAnchor` üzerinden kursaydık aynı
    // adrese saniyeler içinde ikinci kod istenirdi ve 60 sn'lik bekleme kuralına takılırdı (0003) —
    // ölçtüğümüz şey de tetik değil, o kural olurdu.
    const m = await musteri('Postalı');
    const adres = posta('donus');
    await profiles.update({ id: m.id, email: adres, emailAnchoredAt: new Date().toISOString() });

    const row = await phones.findActive(m.phone);
    expect(await raiseChallengeIfDue(db, { profile: (await profiles.getById(m.id))!, previous: gecmis(row, 200) })).toBe('silence');

    // Soru açıldı VE kod yeniden yola çıktı — ajan "kutunuza gönderdik" diyebilsin diye.
    const sonra = await profiles.getById(m.id);
    expect(sonra?.anchorEmail).toBe(adres);
    expect(await anchorGateOf(db, m.id)).toMatchObject({ state: 'email', open: false, ask: 'email' });

    // Ve cevap yine NUMARADAN dönüyor: çapraz kanal, bu kez dönüş anında.
    expect(await answerEmailAnchor(db, m.phone, KOD)).toMatchObject({ status: 'anchored', customerId: m.id });
    expect(await anchorGateOf(db, m.id)).toMatchObject({ open: true, ask: null });
  });

  it('kod GÖNDERİLEMESE bile soru açık kalır — kapı kapalı olmalı', async () => {
    // Gönderim engellenebilir (bekleme kuralı, Resend arızası). O hâlde soruyu düşürmek, kapıyı
    // sessizce açmak olurdu: kimlik şüphesi gönderim başarısına bağlı değil.
    const m = await musteri('Gönderilemedi');
    const adres = posta('engel');
    await profiles.update({ id: m.id, email: adres, emailAnchoredAt: new Date().toISOString() });
    // Adrese az önce kod istendi → 60 sn'lik bekleme penceresi açık (0003).
    await new EmailVerificationService(db).requestCode(adres, KOD);

    const row = await phones.findActive(m.phone);
    expect(await raiseChallengeIfDue(db, { profile: (await profiles.getById(m.id))!, previous: gecmis(row, 200) })).toBe('silence');

    const sonra = await profiles.getById(m.id);
    expect(sonra?.challengeReason).toBe('silence');
    expect(sonra?.anchorEmail).toBeNull(); // bekleyen adres yazılmadı: kod üretilemedi
    expect(await anchorGateOf(db, m.id)).toMatchObject({ open: false, ask: 'email' });
  });

  it('doğru cevap kapıyı AÇAR — ayrı bir kapatma adımı yok', async () => {
    const m = await musteri('Cevaplayan');
    const kod = await issueSecurityCode(db, m.id);
    await raiseChallengeIfDue(db, { profile: (await profiles.getById(m.id))!, previous: gecmis(await phones.findActive(m.phone), 200) });
    expect(await anchorGateOf(db, m.id)).toMatchObject({ open: false, ask: 'code' });

    if (kod.status !== 'ok') throw new Error('kod üretilemedi');
    expect(await verifySecurityCode(db, m.phone, `kodum ${kod.code}`)).toEqual({ status: 'ok', customerId: m.id });
    expect(await anchorGateOf(db, m.id)).toMatchObject({ state: 'code', open: true, ask: null });
  });

  it('`recordProof` tazelemeden ÖNCEKİ satırı döndürür — boşluk başka hiçbir yerde ölçülemez', async () => {
    const m = await musteri('Ölçüm');
    const once = await phones.findActive(m.phone);
    const sonuc = await phones.recordProof(m.id, m.phone);

    expect(sonuc.status).toBe('seen');
    expect(sonuc.previous?.lastSeenAt).toBe(once?.lastSeenAt);
    // Tazelenmiş hâl ileri gitti (ya da eşit — aynı milisaniye): geriye ASLA gitmez.
    expect(new Date(sonuc.row!.lastSeenAt).getTime()).toBeGreaterThanOrEqual(new Date(once!.lastSeenAt).getTime());
  });
});

/**
 * **Çapayı kendiliğinden vermek** (04.10 · kullanıcı senaryosu 26.08).
 *
 * Kullanıcının kurgusu: *"müşteri selam verir, selamını alırız; ilk siparişle beraber hesabı
 * oluşturulur ve kendisine bu kod verilir, saklaması istenir."* Sınanan da tam olarak o sıra:
 *   1. **Selamda kod YOK** — kaybedecek bir şeyi olmayan yabancıya sır kurulmaz.
 *   2. **Siparişten sonraki mesajda kod VAR** — ve sohbete yazılır, ekrana değil.
 *   3. **İkinci kez verilmez** — yeni kod öncekini geçersiz kılar, müşteri sakladığını boşuna yazar.
 *   4. **Çapası olana hiç verilmez.**
 *
 * Pencere kuralı testin kurgusunda da geçerli: kod ancak GELEN mesajdan sonra gidebilir (ADR-005).
 */
describe('çapa kendiliğinden veriliyor', () => {
  const conversationIds: string[] = [];
  const orderIds: string[] = [];
  let warehouseId: string;
  let variantId: string;
  let productId: string;
  let categoryId: string;

  beforeAll(async () => {
    warehouseId = (await createTestWarehouse(db)).id;
    categoryId = (await new CategoryService(db).create({ name: { tr: `Çapa testi ${stamp}` } })).id;
    const { product, variants } = await new ProductService(db).create({
      name: { tr: `Çapa ürünü ${stamp}` },
      categoryId,
      variants: [{ label: { tr: '1 kg' } }],
    });
    productId = product.id; // teardown'a bildirilmezse hiçbir cascade toplamaz
    variantId = variants[0]!.id;
  });

  afterAll(async () => {
    // `productIds` eklendi (ölçüldü 27.08): ürün bildirilmiyordu ve hiçbir cascade onu toplamıyordu —
    // yeşil koşular bile her turda bir "Çapa ürünü …" bırakıyordu.
    await purgeTestData(db, { orderIds, conversationIds, productIds: [productId], warehouseIds: [warehouseId], categoryIds: [categoryId] });
  });

  /** Çağrıları KAYDEDEN sahte sağlayıcı — "gitti mi" ve "ne yazdı" ayrı sorular. */
  function fakeSender(): MessageSender & { texts: string[] } {
    const texts: string[] = [];
    return {
      name: 'fake',
      texts,
      send: async (_target, input) => {
        texts.push(input.text ?? '');
        return { ok: true, providerMessageId: `FAKE-${texts.length}` };
      },
    };
  }

  /** Penceresi AÇIK konuşma — pencereyi yalnız gelen mesaj açar; kod da ancak o zaman gidebilir. */
  async function konusma(customerId: string, phone: string) {
    const row = await conversations.open({ source: 'whatsapp', externalRef: phone, customerId, providerAccountRef: 'ACC-TEST', profileName: null });
    conversationIds.push(row.id);
    await recordInboundMessage(db, { conversationId: row.id, text: 'merhaba', receivedAt: new Date().toISOString() });
    return row;
  }

  async function siparis(customerId: string, status: Order['status'] = 'confirmed') {
    const { order } = await new OrderService(db).create(
      { warehouseId, customerId, channel: 'b2c', deliveryType: 'shipping', totalCents: 2000, status },
      [{ variantId, qty: 1, unitPriceCents: 2000, vatRate: 5.5 }],
    );
    orderIds.push(order.id);
    return order;
  }

  it('SELAM veren yabancıya kod VERİLMEZ — kaybedecek bir şeyi yok', async () => {
    const m = await musteri('Selamlayan');
    const sohbet = await konusma(m.id, m.phone);
    const sender = fakeSender();

    expect(await offerAnchorIfDue(db, sender, { conversationId: sohbet.id, customerId: m.id })).toBe('skipped');
    expect(sender.texts).toEqual([]);
    expect((await profiles.getById(m.id))?.securityCodeHash).toBeNull();
  });

  it('SİPARİŞ verdikten sonraki mesajda kod gider ve SOHBETE yazılır', async () => {
    const m = await musteri('Sipariş veren');
    await siparis(m.id);
    const sohbet = await konusma(m.id, m.phone);
    const sender = fakeSender();

    expect(await offerAnchorIfDue(db, sender, { conversationId: sohbet.id, customerId: m.id })).toBe('sent');
    expect(sender.texts).toHaveLength(1);
    expect(sender.texts[0]).toContain('Bunu saklayın');
    expect(sender.texts[0]).toMatch(/\d{6}/);

    // Çapa gerçekten kuruldu: kapı açıldı ve dönüşünde sorulacak bir şey var.
    expect((await profiles.getById(m.id))?.securityCodeHash).not.toBeNull();
    expect(await anchorGateOf(db, m.id)).toMatchObject({ state: 'code', open: true });
  });

  it('kod İKİNCİ kez verilmez — yenisi öncekini geçersiz kılardı', async () => {
    const m = await musteri('İki mesaj yazan');
    await siparis(m.id);
    const sohbet = await konusma(m.id, m.phone);
    const sender = fakeSender();

    await offerAnchorIfDue(db, sender, { conversationId: sohbet.id, customerId: m.id });
    const ilkOzet = (await profiles.getById(m.id))?.securityCodeHash;
    expect(await offerAnchorIfDue(db, sender, { conversationId: sohbet.id, customerId: m.id })).toBe('skipped');

    expect(sender.texts).toHaveLength(1);
    expect((await profiles.getById(m.id))?.securityCodeHash).toBe(ilkOzet); // müşterinin sakladığı kod yaşıyor
  });

  it('TASLAK sipariş sayılmaz — yarıda bırakılmış checkout kaybedilecek bir şey üretmez', async () => {
    const m = await musteri('Yarıda bırakan');
    await siparis(m.id, 'draft');
    const sohbet = await konusma(m.id, m.phone);
    const sender = fakeSender();

    expect(await offerAnchorIfDue(db, sender, { conversationId: sohbet.id, customerId: m.id })).toBe('skipped');
    expect(sender.texts).toEqual([]);
  });

  it('ÇAPASI olana kod verilmez — iki çapa bir arada bulunmaz', async () => {
    const m = await musteri('E-postalı');
    await siparis(m.id);
    await profiles.update({ id: m.id, email: posta('otomatik'), emailAnchoredAt: new Date().toISOString() });
    const sohbet = await konusma(m.id, m.phone);
    const sender = fakeSender();

    expect(await offerAnchorIfDue(db, sender, { conversationId: sohbet.id, customerId: m.id })).toBe('skipped');
    expect(sender.texts).toEqual([]);
    expect((await profiles.getById(m.id))?.securityCodeHash).toBeNull();
  });

  it('OTOMATİK yolda gönderim düşerse kod GERİ ALINIR — müşterinin bilmediği bir sır kalmasın', async () => {
    // Bu, otomatik yolun en önemli kuralı: iletecek insan YOK. Satırda kalan bir kod, dönüşünde
    // müşteriye cevaplayamayacağı bir soru sordururdu — çapasızlıktan BETER, çünkü çapasıza hiç
    // soru sorulmuyor. Ölçülmüş hâl: gönderim jetonu yokken sürücü her gönderimi reddediyor.
    const m = await musteri('Jetonsuz gönderim');
    await siparis(m.id);
    const sohbet = await konusma(m.id, m.phone);
    const dusen: MessageSender = { name: 'fake-fail', send: async () => ({ ok: false, reason: 'not_configured', retryable: false }) };

    expect(await offerAnchorIfDue(db, dusen, { conversationId: sohbet.id, customerId: m.id })).toBe('send_failed');
    expect((await profiles.getById(m.id))?.securityCodeHash).toBeNull();

    // Kendini onarır: kod silindiği için bir sonraki mesajda koşul yine tutuyor.
    const calisan = fakeSender();
    expect(await offerAnchorIfDue(db, calisan, { conversationId: sohbet.id, customerId: m.id })).toBe('sent');
    expect(calisan.texts).toHaveLength(1);
  });

  it('OPERATÖR yolunda gönderim düşerse kod İNSANA döner — orada iletecek biri var', async () => {
    const m = await musteri('Gönderimi düşen');
    await siparis(m.id);
    const sohbet = await konusma(m.id, m.phone);
    const dusenSender: MessageSender = { name: 'fake-fail', send: async () => ({ ok: false, reason: 'provider_down', retryable: true }) };

    const sonuc = await issueAndSendSecurityCode(db, dusenSender, { conversationId: sohbet.id, customerId: m.id });
    expect(sonuc.status).toBe('send_failed');
    if (sonuc.status !== 'send_failed') throw new Error('beklenen hâl değil');
    expect(sonuc.code).toMatch(/^\d{6}$/);

    // Kod SATIRDA duruyor: müşteri onu operatörden alacak ve kendi numarasından yazabilecek.
    expect(await verifySecurityCode(db, m.phone, sonuc.code)).toEqual({ status: 'ok', customerId: m.id });
  });
});
