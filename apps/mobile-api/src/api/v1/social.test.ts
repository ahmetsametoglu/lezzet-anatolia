import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConversationService, UserProfileService, anonDb, serviceDb } from '@lezzet/database';
import { createTestWarehouse, purgeTestData } from '@lezzet/database/testing';
import { recordInboundMessage } from '@lezzet/application';
// Beklenen şekiller ELLE YAZILMAZ, sözleşmeden gelir: uç bir alanı düşürürse iddia değil DERLEME
// kırılır (depo/kurye testlerinin kararı).
import type { SocialConversationDetail, SocialInboxResponse, SocialModeResponse } from '@lezzet/types';
import { app } from '../../app';

/**
 * Sosyal gelen kutusu uçları (15.17 · test dalgası 15.18) — `app.request()` ile PORT AÇMADAN.
 *
 * İki şey sınanıyor ve ikisi de TAŞIMA katmanının işi:
 *
 * 1. **Kapı yalnız yöneticiye açık.** Sosyal kutu müşteri yazışmalarını gösteriyor — depocu ya da
 *    kurye rolü buraya girememeli. "Personel" olmak yetmez.
 * 2. **`ai` modu SUNUCUDA reddedilir** (15.13). Ekranda kapatmak yetmez: kural sunucuda durmalı,
 *    tek istemcinin nezaketine bırakılmamalı. Arkasında motoru olmayan bir mod yazılabilir kalırsa
 *    sohbet, operatör AI ilgileniyor sanarken cevapsız bekler.
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

describe('defter kaydı — cevap ucu GÜNCEL detayı döndürür', () => {
  it('kayıt yazılır ve dönen gövde yeni mesajı İÇERİR', async () => {
    // Dönen detay, istemcinin elindeki kopyayı değil SUNUCUYU gerçek sayar: başka bir operatör az
    // önce yazmış olabilir. Bu yüzden uç, yazdıktan sonra tam detayı geri veriyor.
    const res = await post(
      `/api/v1/social/conversations/${conversationId}/reply`,
      { text: 'Merhaba, 225 g paket 4,57 €.' },
      adminToken,
    );
    expect(res.status).toBe(200);

    const body = (await res.json()) as { data: SocialConversationDetail; error: null };
    const giden = body.data.messages.filter((m) => m.direction === 'outbound');
    expect(giden.some((m) => m.body.text === 'Merhaba, 225 g paket 4,57 €.')).toBe(true);
  });

  it('BOŞ metin 400 — deftere boş satır düşmez', async () => {
    const res = await post(`/api/v1/social/conversations/${conversationId}/reply`, { text: '   ' }, adminToken);
    expect(res.status).toBe(400);
  });

  it('müşteri rolü kayıt YAZAMAZ', async () => {
    const res = await post(`/api/v1/social/conversations/${conversationId}/reply`, { text: 'olmaz' }, outsiderToken);
    expect(res.status).toBe(403);
  });
});
