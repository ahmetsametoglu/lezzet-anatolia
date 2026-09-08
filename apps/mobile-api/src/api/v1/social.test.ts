import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConversationService, UserProfileService, anonDb, serviceDb } from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import { recordInboundMessage } from '@lezzet/application';
// Beklenen şekiller ELLE YAZILMAZ, sözleşmeden gelir: uç bir alanı düşürürse iddia değil DERLEME
// kırılır (depo/kurye testlerinin kararı).
import type {
  SocialConversationDetail,
  SocialInboxResponse,
  SocialModeResponse,
  SocialReplyResponse,
} from '@lezzet/types';
import { app } from '../../app';

/**
 * Sosyal gelen kutusu uçları (15.17 · test dalgası 15.18) — `app.request()` ile PORT AÇMADAN.
 *
 * İki şey sınanıyor ve ikisi de TAŞIMA katmanının işi:
 *
 * 1. **Kapı yalnız yöneticiye açık.** Sosyal kutu müşteri yazışmalarını gösteriyor — depocu ya da
 *    kurye rolü buraya girememeli. "Personel" olmak yetmez.
 * 2. **Mod kuralı SUNUCUDA durur.** Ekranda kapatmak yetmez, tek istemcinin nezaketine
 *    bırakılamaz: enum dışı bir değer 400 alır, aynı moda ikinci yazma 409 `mode_unchanged` ile
 *    görünür bir yarış işareti üretir. *(Bu madde 29.08'e kadar "`ai` reddedilir" diyordu; özerk
 *    motor bağlandığında `ai` kabul edilir oldu — künye o gün bayatladı, aşağıdaki iddia güncel.)*
 *
 * Paylaşılan-DB disiplini (`CLAUDE §4b`): zemin bu dosyanın kendi damgalı satırları; küresel sayıya
 * bakan tek iddia yok — sayaçlar bile kendi konuşmamızla değil, "en az bir" ile sınanıyor.
 *
 * **Telefon damgası dosyaya özgü** (`09…`): `user_profiles.phone` benzersiz; depo testi `07…`,
 * kurye `06…` kullanıyor ve aynı milisaniyede kurulan iki dosya birbirini düşürmemeli.
 */
const stamp = Date.now();
const db = serviceDb();
const conversations = new ConversationService(db);

const profileIds: string[] = [];
const authUserIds: string[] = [];
const conversationIds: string[] = [];
const warehouseIds: string[] = [];

let adminToken = '';
let outsiderToken = '';
let warehouseToken = '';
let conversationId = '';

/**
 * Auth kullanıcısı + rolleri yazılmış profil + açık oturum.
 *
 * Roller AÇIKÇA yazılıyor, trigger'ın verdiğine güvenilmiyor (depo testinin dersi): `0002` ilk
 * kullanıcıya `admin` veriyor — yani "rolsüz kullanıcı" testi, yerel veritabanında hiç admin yoksa
 * sessizce ADMİN üretir ve 403 iddiası yanlış sebeple kırılırdı.
 */
async function signedInUser(label: string, roles: ('customer' | 'warehouse' | 'admin')[], scope: string[] = []) {
  const email = `social-api-${label}-${stamp}@example.test`;
  const password = randomUUID();
  const { data: created, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !created.user) throw new Error(`test kullanıcısı açılamadı: ${error?.message ?? 'kullanıcı yok'}`);
  authUserIds.push(created.user.id);

  const profiles = new UserProfileService(db);
  const profile = await profiles.findByAuthUserId(created.user.id);
  if (!profile) throw new Error('auth trigger profil satırı açmadı');
  profileIds.push(profile.id);
  await profiles.update({ id: profile.id, roles, warehouseIds: scope, name: `Sosyal ${label}` });

  const { data: session, error: signInError } = await anonDb().auth.signInWithPassword({ email, password });
  if (signInError || !session.session) throw new Error(`oturum açılamadı: ${signInError?.message ?? 'oturum yok'}`);
  return session.session.access_token;
}

const get = (path: string, token: string) => app.request(path, { headers: { authorization: `Bearer ${token}` } });

const post = (path: string, body: unknown, token: string) =>
  app.request(path, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeAll(async () => {
  adminToken = await signedInUser('patron', ['admin']);
  outsiderToken = await signedInUser('musteri', ['customer']);
  /* Depocuya GERÇEK bir depo veriliyor: `user_profiles_warehouse_scope` kısıtı `warehouse`/`courier`
     rolünde en az bir depo şart koşuyor (0031) — kapsamsız depocu satırı DB'ye hiç girmiyor. Kısıtın
     gerekçesi de bu testin işine yarıyor: kapsamsız personel sessizce boş ekrana bakardı. */
  const depo = await createTestWarehouse(db, { label: 'SOS' });
  warehouseIds.push(depo.id);
  warehouseToken = await signedInUser('depocu', ['warehouse'], [depo.id]);

  const conversation = await conversations.open({
    source: 'whatsapp',
    externalRef: `+3369${String(stamp).slice(-7)}`,
    customerId: null,
    providerAccountRef: 'ACC-SOCIAL-TEST',
    profileName: 'Sosyal Uç Testi',
  });
  conversationId = conversation.id;
  conversationIds.push(conversation.id);
  // Pencereyi GELEN mesaj açar (ADR-005) — kuyruk satırının "cevap bekliyor" olması da buna bağlı.
  await recordInboundMessage(db, {
    conversationId,
    text: 'Fıstıklı baklava var mı?',
    receivedAt: new Date().toISOString(),
  });
}, 60_000);

afterAll(async () => {
  await purgeTestData(db, { conversationIds, profileIds, authUserIds, warehouseIds });
});

describe('kapı: Bearer + YALNIZ yönetici', () => {
  it('Bearer olmadan 401 — sosyal kutu oturumsuz gezilmez', async () => {
    const res = await app.request('/api/v1/social/conversations');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ data: null, error: 'unauthorized' });
  });

  it('MÜŞTERİ rolü 403 — burada müşteri yazışmaları duruyor', async () => {
    const res = await get('/api/v1/social/conversations', outsiderToken);
    expect(res.status).toBe(403);
  });

  it('DEPOCU rolü de 403 — "personel olmak" yetmez', async () => {
    // Kapı `requireStaffRole('admin')`: sosyal kutu tüm müşteri yazışmalarını gösteriyor ve depo
    // rolünün bu veriyle işi yok. Genel bir "personel" kapısı burada fazla geniş olurdu.
    const res = await get('/api/v1/social/conversations', warehouseToken);
    expect(res.status).toBe(403);
  });

  it('yönetici 200 — ve kuyruk kendi konuşmamızı taşıyor', async () => {
    const res = await get('/api/v1/social/conversations', adminToken);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { data: SocialInboxResponse; error: null };
    expect(body.error).toBeNull();
    expect(body.data.rows.some((row) => row.id === conversationId)).toBe(true);
    // Küresel sayıya iddia yazılmaz (başka ajanın satırı oynatır) — "en az bir" yeter.
    expect(body.data.counts.awaitingReply).toBeGreaterThanOrEqual(1);
  });
});

describe('medya sözleşmede TAŞINIR (21.287)', () => {
  it('medya mesajı mime · transkript · adres alanlarıyla iner', async () => {
    /*
      Buraya kadar sözleşme medyayı hiç taşımıyordu ve mobil ekran fotoğrafı da sesi de aynı yer
      tutucu yazısıyla ("[görsel / dosya]") çiziyordu. Alanların VARLIĞI sınanıyor:

      · `mediaMime` — ekran fotoğrafı mı sesi mi çizeceğini yalnız buradan bilir (`kind` ikisine de
        `media` diyor).
      · `mediaTranscript` — sesli mesajın makine çözümü; ses çalınamasa bile okunacak tek içerik.
      · `mediaUrl` — İMZALI adres. Yerelde R2 ayarlı olmadığı için `null` ve bu meşru bir hâl
        (`privateReadUrl` kovasızken `null` döner); iddia adresin DOLU olması değil, ALANIN var
        olmasıdır — `undefined` dönmesi sözleşmenin düştüğü anlamına gelirdi.
    */
    await recordInboundMessage(db, {
      conversationId,
      kind: 'media',
      text: null,
      mediaKey: `conversation-media/test-${stamp}.ogg`,
      mediaMime: 'audio/ogg',
      mediaTranscript: 'Siparişim bugün gelecek mi',
      receivedAt: new Date().toISOString(),
    });

    const res = await get(`/api/v1/social/conversations/${conversationId}`, adminToken);
    const body = (await res.json()) as { data: SocialConversationDetail; error: null };
    const medya = body.data.messages.find((m) => m.kind === 'media');

    expect(medya).toBeDefined();
    expect(medya?.mediaMime).toBe('audio/ogg');
    expect(medya?.mediaTranscript).toBe('Siparişim bugün gelecek mi');
    expect(medya).toHaveProperty('mediaUrl');
  });

  it('medyası OLMAYAN mesajın alanları boş — uydurma adres üretilmez', async () => {
    const res = await get(`/api/v1/social/conversations/${conversationId}`, adminToken);
    const body = (await res.json()) as { data: SocialConversationDetail; error: null };
    const metin = body.data.messages.find((m) => m.kind === 'text');

    expect(metin?.mediaMime).toBeNull();
    expect(metin?.mediaUrl).toBeNull();
  });
});

describe('yürütücü modu — kural SUNUCUDA durur', () => {
  it('`ai` modu KABUL EDİLİR (29.08) — artık arkasında motoru olan bir mod', async () => {
    /* Bu iddia bir tur boyunca TERSİNİ söylüyordu ("400 ile reddedilir — arkasında motoru olmayan
       mod yazılamaz") ve o gün haklıydı. Kısıt kullanıcı kararıyla kalktı; şart üç ölçümle
       karşılandı: motor (`runAutonomousConversationReply`), cron taraması (`support-ai.ts`
       `handledBy === 'ai'`) ve gönderim kanalı (Meta jetonu, canlı doğrulandı).

       Uç HİÇ değişmedi — doğrulama `SocialModeRequestSchema`den, o da `ConversationHandlerEnum`den
       türüyor. Yani bu testin düşmesi tam olarak istenen şeydi: sözleşme genişleyince mobil uç da
       elle dokunulmadan genişledi ve bunu haber veren şey bu satır oldu. */
    const res = await post(`/api/v1/social/conversations/${conversationId}/mode`, { mode: 'ai' }, adminToken);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: SocialModeResponse; error: null };
    expect(body.data.mode).toBe('ai');
  });

  it('bilinmeyen mod HÂLÂ 400 — genişleme "her şeyi kabul et" demek değil', async () => {
    // Kural yerinde duruyor, yalnız ne dediği değişti: `ticket_handler` kolonu bu üç değerden
    // başkasını taşıyamaz ve uç da taşıtmamalı.
    const res = await post(`/api/v1/social/conversations/${conversationId}/mode`, { mode: 'robot' }, adminToken);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ data: null, error: 'invalid_body' });
  });

  it('`hybrid` kabul edilir ve YANIT yeni modu söyler', async () => {
    const res = await post(`/api/v1/social/conversations/${conversationId}/mode`, { mode: 'hybrid' }, adminToken);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: SocialModeResponse; error: null };
    expect(body.data.mode).toBe('hybrid');
  });

  it('AYNI moda ikinci çağrı 409 — sessiz "oldu" demek, öteki operatörün değişikliğini yutmaktır', async () => {
    const res = await post(`/api/v1/social/conversations/${conversationId}/mode`, { mode: 'hybrid' }, adminToken);
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ data: null, error: 'mode_unchanged' });
  });

  it('bozuk kimlik 400, olmayan konuşma 404 — ikisi ayrı cevap', async () => {
    expect((await post('/api/v1/social/conversations/abc/mode', { mode: 'human' }, adminToken)).status).toBe(400);
    const yok = await post(
      '/api/v1/social/conversations/00000000-0000-4000-8000-0000000000ff/mode',
      { mode: 'human' },
      adminToken,
    );
    expect(yok.status).toBe(404);
  });
});

describe('cevap ucu GÖNDERİR — akıbet zarfın içinde (21.286)', () => {
  /*
    ZARF DEĞİŞTİ, UÇ ADI DEĞİŞMEDİ. Cevap artık `SocialConversationDetail` DÖNMÜYOR: dönen şey
    `{status, reason, retryable, detail}` — çünkü uç 200 dönse de mesaj gitmemiş olabilir
    (pencere kapalı → `refused`, sağlayıcı düştü → `failed`) ve detay yalnız gerçekten gidince
    doldurulur.

    YEREL KOŞUDA GÖNDERİM HEP DÜŞER ve bu ölçüldü, varsayılmadı: `vitest.setup.ts` yalnız KÖK
    `.env`i yüklüyor, `META_ACCESS_TOKEN` ise `apps/mobile-api/.env.local`da duruyor. Yani test
    paketi hiçbir zaman gerçek bir WhatsApp çağrısı yapmaz — `messageSenderFor(undefined)`
    reddeden sürücüyü döndürür ve akıbet `failed · not_configured` olur. Bu, testin bir eksiği
    değil bir GÜVENCESİDİR: jetonu köke taşıyan biri, paketi canlı mesaj göndermeye başlatırdı.
  */
  it('akıbet zarfı döner; jetonsuz yerelde gönderim DÜŞER ve detay boş kalır', async () => {
    const res = await post(
      `/api/v1/social/conversations/${conversationId}/reply`,
      { text: 'Merhaba, 225 g paket 4,57 €.' },
      adminToken,
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as { data: SocialReplyResponse; error: null };
    expect(body.data.status).not.toBe('sent');
    expect(body.data.reason).toBe('not_configured');
    // Gitmemiş cevaptan sonra yazışma TAZELENMEZ — değişmemiş bir listeyi ikinci kez çizdirmek olurdu.
    expect(body.data.detail).toBeNull();
  });

  it('gitmeyen cevap DEFTERE de yazılmaz — sessiz "gitti" kaydı doğmaz', async () => {
    /* En tehlikeli hâl budur: operatör gönderdiğini sanır, defter onu doğrular, müşteri hiçbir şey
       almaz. Yukarıdaki düşen gönderimin ardından giden mesaj sayısı artmamalı. */
    const res = await get(`/api/v1/social/conversations/${conversationId}`, adminToken);
    const body = (await res.json()) as { data: SocialConversationDetail; error: null };
    expect(body.data.messages.some((m) => m.body.text === 'Merhaba, 225 g paket 4,57 €.')).toBe(false);
  });

  it('BOŞ metin 400 — gövde doğrulaması kapıda', async () => {
    const res = await post(`/api/v1/social/conversations/${conversationId}/reply`, { text: '   ' }, adminToken);
    expect(res.status).toBe(400);
  });

  it('müşteri rolü cevap GÖNDEREMEZ', async () => {
    const res = await post(`/api/v1/social/conversations/${conversationId}/reply`, { text: 'olmaz' }, outsiderToken);
    expect(res.status).toBe(403);
  });
});
