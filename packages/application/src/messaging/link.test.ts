import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConversationService, OrderService, ProductService, UserProfileService, serviceDb } from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import { generateReferenceNo } from '@lezzet/domain-core';
import { linkConversationCustomer } from './link';

/**
 * **KANITLI BAĞLAMA KAPISI** (15.19) — kimliksiz sohbeti müşteriye bağlamanın tek yolu.
 *
 * ── NEDEN BU KAPI SINANIYOR ─────────────────────────────────────────────────
 * Messenger/Instagram'da kimliğin başka otomatik yolu yok; bağı operatör kuruyor. Bağ kurulur
 * kurulmaz **ajanın araçları da** o müşteriye açılıyor (`ticket/support-tools.ts` kimliğe
 * kapatılmıştır), yani yanlış bir bağ tek alanı değil o müşterinin verisinin TAMAMINI açar.
 * Kapının gevşediği gün kimse fark etmez — gevşeme bir hata vermez, yalnız bir reddi geçirir.
 *
 * ── SINANAN ŞEY "KANIT SUNUCUDA DOĞRULANIYOR MU" ────────────────────────────
 * Testlerin çoğu REDDİ sınıyor ve bu bilinçli: bir güvenlik kapısında değerli olan, geçirdiği
 * değil GEÇİRMEDİĞİdir. Başka müşterinin sipariş numarası, yanlış e-posta, boş değer — üçü de
 * bağ kurmamalı ve kurmadıkları satırdan okunarak doğrulanmalı (dönen cevaba bakmak yetmez:
 * "reddettim" diyip yazan bir kapı da aynı cevabı verirdi).
 */
const db = serviceDb();
const conversations = new ConversationService(db);
const profiles = new UserProfileService(db);

const stamp = Date.now();
const profileIds: string[] = [];
const conversationIds: string[] = [];
const productIds: string[] = [];
let warehouseId = '';
let musteriId = '';
let yabanciId = '';
let personelId = '';
let siparisNo = '';
let yabancininSiparisNo = '';

const EPOSTA = `bag-musteri-${stamp}@example.test`;
/** Kayıtta E.164 durur; operatör müşterinin SÖYLEDİĞİ biçimi yazar — normalize kapının işi. */
const TELEFON = `+336${String(stamp).slice(-8)}`;

let sira = 0;
/** Her sohbet KENDİ kimliğiyle: bağ tek yönlü ve geri alınamaz, paylaşılan sohbet ikinci testi bozar. */
async function taszeSohbet() {
  sira += 1;
  const konusma = await conversations.open({
    source: 'instagram',
    externalRef: `IGSID-BAG-${stamp}-${sira}`,
    customerId: null,
    providerAccountRef: 'IG-TEST',
    profileName: null,
  });
  conversationIds.push(konusma.id);
  return konusma;
}

async function siparisAc(customerId: string, label: string): Promise<string> {
  const { product, variants } = await new ProductService(db).create({
    name: { tr: `Bağ ürünü ${label} ${stamp}` },
    status: 'active',
    variants: [{ label: { tr: '1 kg' } }],
  });
  productIds.push(product.id);
  const orders = new OrderService(db);
  const { order } = await orders.create(
    { warehouseId, customerId, channel: 'b2c', deliveryType: 'route', paymentMethod: 'cash', totalCents: 1000 },
    [{ variantId: variants[0]!.id, qty: 1, unitPriceCents: 1000, vatRate: 5.5 }],
  );
  /* Referansı GEÇİŞE VEREN taraf üretiyor (`transition_order_status`: `coalesce(reference_no,
     p_reference_no)`) — RPC kendiliğinden üretmiyor. Ölçüldü 24.08: `advanceOrder` fikstürü
     referans geçirmediği için sipariş `confirmed` olduğu hâlde numarası `null` kalıyordu ve bu
     dosyanın iki iddiası "kanıt boş" diye çöküyordu. Numarayı motor üretiyor, biz geçiriyoruz. */
  const referenceNo = generateReferenceNo({ year: new Date().getFullYear() });
  const sonuc = await orders.transition({ orderId: order.id, from: 'draft', to: 'confirmed', referenceNo });
  if (!sonuc.ok) throw new Error(`fikstür: sipariş onaylanamadı (${label})`);
  return (await orders.getById(order.id))!.referenceNo!;
}

beforeAll(async () => {
  warehouseId = (await createTestWarehouse(db, { label: 'BAG' })).id;

  const musteri = await profiles.insert({ name: `Bağ müşteri ${stamp}`, email: EPOSTA, phone: TELEFON });
  musteriId = musteri.id;
  const yabanci = await profiles.insert({ name: `Bağ yabancı ${stamp}`, email: `bag-yabanci-${stamp}@example.test` });
  yabanciId = yabanci.id;
  const personel = await profiles.insert({ name: `Bağ personeli ${stamp}`, roles: ['admin'] });
  personelId = personel.id;
  profileIds.push(musteriId, yabanciId, personelId);

  siparisNo = await siparisAc(musteriId, 'musteri');
  yabancininSiparisNo = await siparisAc(yabanciId, 'yabanci');
}, 60_000);

afterAll(async () => {
  await purgeTestData(db, { conversationIds, profileIds, productIds, warehouseIds: [warehouseId] });
});

describe('kanıt TUTMAZSA bağ kurulmaz', () => {
  it('BAŞKA müşterinin sipariş numarası kabul edilmez', async () => {
    // Sosyal mühendisliğin en olası hâli: kişi gerçek ama BAŞKASININ numarasını biliyor. Doğrulama
    // müşteriye kapatılmış kapıdan geçtiği için (`findByReference(ref, customerId)`) eşleşme yok.
    const konusma = await taszeSohbet();
    const sonuc = await linkConversationCustomer(db, {
      conversationId: konusma.id,
      customerId: musteriId,
      proof: { kind: 'order_ref', value: yabancininSiparisNo },
      staffId: personelId,
    });

    expect(sonuc).toEqual({ status: 'refused', reason: 'proof_mismatch' });
    // Cevaba bakmak YETMEZ: "reddettim" deyip yazan bir kapı da aynı cevabı verirdi.
    expect((await conversations.getById(konusma.id))?.customerId).toBeNull();
  });

  it('yanlış e-posta kabul edilmez', async () => {
    const konusma = await taszeSohbet();
    const sonuc = await linkConversationCustomer(db, {
      conversationId: konusma.id,
      customerId: musteriId,
      proof: { kind: 'email', value: `baska-${stamp}@example.test` },
      staffId: personelId,
    });
    expect(sonuc).toEqual({ status: 'refused', reason: 'proof_mismatch' });
    expect((await conversations.getById(konusma.id))?.customerId).toBeNull();
  });

  it('BOŞ değer kanıt sayılmaz — kaçış yolu yok', async () => {
    // Kapının en sessiz gevşemesi bu olurdu: boş dizeyi "kanıt yok ama olsun" diye geçirmek.
    const konusma = await taszeSohbet();
    const sonuc = await linkConversationCustomer(db, {
      conversationId: konusma.id,
      customerId: musteriId,
      proof: { kind: 'email', value: '   ' },
      staffId: personelId,
    });
    expect(sonuc).toEqual({ status: 'refused', reason: 'proof_mismatch' });
  });

  it('kanıtı olmayan MÜŞTERİ kaydı da geçirmez — telefonu boş kayıtta telefon kanıtı tutmaz', async () => {
    // `yabanci`nin telefonu yok. Karşılaştırma `null == null` diye geçseydi, telefonsuz her kayda
    // herhangi bir numarayla bağlanılırdı — kapının en tehlikeli sessiz dalı.
    const konusma = await taszeSohbet();
    const sonuc = await linkConversationCustomer(db, {
      conversationId: konusma.id,
      customerId: yabanciId,
      proof: { kind: 'phone', value: TELEFON },
      staffId: personelId,
    });
    expect(sonuc).toEqual({ status: 'refused', reason: 'proof_mismatch' });
  });
});

describe('kanıt TUTARSA bağ kurulur ve KÜNYESİ yazılır', () => {
  it('sipariş numarası: bağ kurulur, kim/ne zaman/hangi kanıt satırda durur', async () => {
    const konusma = await taszeSohbet();
    const sonuc = await linkConversationCustomer(db, {
      conversationId: konusma.id,
      customerId: musteriId,
      proof: { kind: 'order_ref', value: siparisNo },
      staffId: personelId,
    });

    expect(sonuc.status).toBe('linked');
    const guncel = await conversations.getById(konusma.id);
    expect(guncel?.customerId).toBe(musteriId);
    expect(guncel?.linkedBy).toBe(personelId);
    expect(guncel?.linkProof).toBe('order_ref');
    expect(guncel?.linkedAt).not.toBeNull();
  });

  it('telefon NORMALİZE edilerek karşılaştırılır — müşteri "06…" der, kayıtta "+336…" durur', async () => {
    // Ham karşılaştırma DOĞRU kanıtı reddederdi ve operatör kapıyı "bozuk" sanıp baypas ararlardı.
    const yerel = `0${TELEFON.slice(3)}`;
    const konusma = await taszeSohbet();
    const sonuc = await linkConversationCustomer(db, {
      conversationId: konusma.id,
      customerId: musteriId,
      proof: { kind: 'phone', value: yerel },
      staffId: personelId,
    });
    expect(sonuc.status).toBe('linked');
    expect((await conversations.getById(konusma.id))?.linkProof).toBe('phone');
  });

  it('e-posta BÜYÜK/küçük harf ve boşluk farkını yutar', async () => {
    const konusma = await taszeSohbet();
    const sonuc = await linkConversationCustomer(db, {
      conversationId: konusma.id,
      customerId: musteriId,
      proof: { kind: 'email', value: `  ${EPOSTA.toUpperCase()}  ` },
      staffId: personelId,
    });
    expect(sonuc.status).toBe('linked');
  });
});

describe('bağ TEK YÖNLÜ — dolu bağ ezilmez', () => {
  it('bağlı sohbete ikinci bağ `already_linked` ile reddedilir, kanıt DOĞRU olsa bile', async () => {
    // Ezme bir BİRLEŞTİRME kararıdır ve insana aittir (DOMAIN §10). Kanıtın doğruluğu bunu
    // değiştirmez: iki müşteri de kendi kanıtını sunabilir, hangisinin sohbeti olduğu ayrı sorudur.
    const konusma = await taszeSohbet();
    await linkConversationCustomer(db, {
      conversationId: konusma.id,
      customerId: musteriId,
      proof: { kind: 'email', value: EPOSTA },
      staffId: personelId,
    });

    const ikinci = await linkConversationCustomer(db, {
      conversationId: konusma.id,
      customerId: yabanciId,
      proof: { kind: 'order_ref', value: yabancininSiparisNo },
      staffId: personelId,
    });
    expect(ikinci).toEqual({ status: 'refused', reason: 'already_linked' });

    const guncel = await conversations.getById(konusma.id);
    expect(guncel?.customerId).toBe(musteriId);
    expect(guncel?.linkProof).toBe('email');
  });
});

describe('olmayan hedefler AYRI sebeplerle reddedilir', () => {
  it('olmayan sohbet ve olmayan müşteri ayrı cevap verir', async () => {
    // Tek bir "bağlanamadı" cümlesi operatöre hangi kapıya gideceğini söylemezdi.
    const yokSohbet = await linkConversationCustomer(db, {
      conversationId: '00000000-0000-4000-8000-0000000000aa',
      customerId: musteriId,
      proof: { kind: 'email', value: EPOSTA },
      staffId: personelId,
    });
    expect(yokSohbet).toEqual({ status: 'refused', reason: 'conversation_not_found' });

    const konusma = await taszeSohbet();
    const yokMusteri = await linkConversationCustomer(db, {
      conversationId: konusma.id,
      customerId: '00000000-0000-4000-8000-0000000000bb',
      proof: { kind: 'email', value: EPOSTA },
      staffId: personelId,
    });
    expect(yokMusteri).toEqual({ status: 'refused', reason: 'customer_not_found' });
  });

  it('personel kimliği bilinmese de bağ kurulur — kim bağladığı kaybolabilir, kanıt hayır', async () => {
    // `linked_by` FK'si `set null` (personel kaydı silinince boşalır); kısıt bu yüzden yalnız
    // damga+kanıt çiftini bağlıyor. Kapı da `staffId: null` ile çalışabilmeli.
    const konusma = await taszeSohbet();
    const sonuc = await linkConversationCustomer(db, {
      conversationId: konusma.id,
      customerId: musteriId,
      proof: { kind: 'email', value: EPOSTA },
      staffId: null,
    });
    expect(sonuc.status).toBe('linked');

    const guncel = await conversations.getById(konusma.id);
    expect(guncel?.linkedBy).toBeNull();
    expect(guncel?.linkProof).toBe('email');
  });
});
