'use server';

import { revalidatePath } from 'next/cache';
import {
  generateConversationDraft,
  issueAndSendSecurityCode,
  linkConversationCustomer,
  messageSenderFor,
  recordConversationOptIn,
  recordInboundMessage,
  recordOutboundMessage,
  startEmailAnchor,
} from '@lezzet/application';
import { ConversationInboxService, ConversationService, serviceDb } from '@lezzet/database';
import { ConversationHandlerEnum, DEFAULT_PAGE_SIZE, type KeysetCursor, type Page, type TicketHandler } from '@lezzet/types';
import { requireAdmin } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { searchCustomerOptions, type CustomerOption } from '@/lib/customer-options';
import { openTicket } from '@/lib/ticket/write';
import { openWhatsappConversation } from '@/lib/messaging/conversation';
import { toInboxRows } from './social-read';
import {
  AnchorEmailSchema,
  ConversationOptInSchema,
  ConversationTicketSchema,
  FollowUpInboundSchema,
  LinkConversationCustomerSchema,
  ManualInboundSchema,
  RecordOutboundSchema,
  type InboxRowView,
} from './social-types';
import { channelSource, parseSocialUrl, SOCIAL_PATH } from './social-url';

// Sosyal gelen kutusunun YAZMA KAPILARI (15.5 · üç kanal 15.15 + 15.1'in yüzey yarısı) — guard ilk,
// kapıya devret, `{ data, error }` DÖNER.
//
// **Hepsi `requireAdmin`.** Ekran yalnız yöneticiye açık ve kapı burada durur: düğmeyi çizmemek bir
// güvence değildir, action doğrudan da çağrılabilir.
//
// **İş kuralı burada YOK.** Kimlik çözümü, pencere hesabı ve israf nöbeti uygulama kapısında
// (`lib/messaging/conversation`) motora sorularak yapılıyor (STACK §4). Buradaki tek çeviri, kapının
// sonucunu ekranın sözleşmesine döndürmek.
//
// ── BURADAN MESAJ GÖNDERİLMEZ ────────────────────────────────────────────────
// Adım 1'de gönderim kanalı yok (webhook/sürücü 15.7/15.11). Bu kapılar DEFTER tutar: yazışma
// admin'in telefonundan/Business Suite'ten yürür, olan biten buraya işlenir. Adları da bunu
// söylüyor — `record…`, `send…` değil.

function refresh(): void {
  revalidatePath(SOCIAL_PATH);
}

/**
 * Kuyruğun SONRAKİ sayfası. Süzgeç ADRESTEN okunur, istemciden gelen bir nesneden değil: devam eden
 * sayfa ilk sayfayla aynı ölçüte uymalı ve o ölçüt tek yerde (`social-url`) tanımlı — kanal çipi de
 * dahil.
 */
export async function loadMoreConversationsAction(search: string, cursor: KeysetCursor): Promise<ActionResult<Page<InboxRowView>>> {
  try {
    await requireAdmin();
    const urlState = parseSocialUrl(Object.fromEntries(new URLSearchParams(search)));
    const page = await new ConversationInboxService(serviceDb()).list(
      { awaitingReply: urlState.f === 'awaiting' ? true : undefined, source: channelSource(urlState.ch) },
      cursor,
      DEFAULT_PAGE_SIZE,
    );
    return { data: { rows: toInboxRows(page.rows, new Date()), nextCursor: page.nextCursor }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * **Gelen DM'i işle** — numaradan konuşmayı açar ve ilk mesajı deftere yazar (15.1'in beyanı).
 * **Yalnız WhatsApp:** kimlik anahtarı telefondur ve operatör onu telefonundan okur; Messenger/IG
 * kişi kimliği (PSID/IGSID) operatörce bilinemez — o konuşmaları webhook doğuracak (15.7).
 *
 * İkisi TEK adımda, çünkü mesajsız açılan bir konuşma gelen kutusunda `last_message_at` boş bir
 * satır olarak durur: sıralaması belirsiz, önizlemesi boş, `awaiting_reply` yanlış. Operatör de
 * zaten okuduğu bir mesaj yüzünden buraya geliyor.
 *
 * Kapının reddi SESSİZ GEÇİLMEZ: numara çözülemediğinde ya da telefon/e-posta ayrı müşterilere
 * çıktığında (`conflict`) konuşma AÇILMAZ — yanlış hesaba bağlanmış bir sohbet, bağlanmamış bir
 * sohbetten pahalıdır. Operatöre ne olduğu söylenir, çünkü çaresi onda: numarayı düzeltmek ya da
 * müşteri kartlarını birleştirmek.
 */
export async function openManualDmAction(input: unknown): Promise<ActionResult<{ conversationId: string }>> {
  try {
    await requireAdmin();
    const parsed = ManualInboundSchema.parse(input);

    const opened = await openWhatsappConversation({
      phone: parsed.phone,
      name: parsed.name?.trim() || null,
      email: parsed.email?.trim() || null,
    });

    if (opened.status === 'invalid_phone') {
      return { data: null, error: 'Numara okunamadı. Ülke koduyla yazın (ör. +33 6 12 34 56 78).' };
    }
    if (opened.status === 'conflict') {
      return {
        data: null,
        error: 'Bu numara ile e-posta ayrı müşterilere ait. Konuşma açılmadı — önce Müşteriler ekranından kayıtları birleştirin.',
      };
    }

    await recordInboundMessage(serviceDb(), {
      conversationId: opened.conversation.id,
      text: parsed.text,
      receivedAt: parsed.receivedAt,
    });

    refresh();
    return { data: { conversationId: opened.conversation.id }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Var olan sohbete GELEN mesaj (devam) — KANAL-NÖTR: konuşma zaten var, kimlik anahtarı gerekmez.
 *
 * Eski yol devam mesajını da telefon üzerinden işliyordu (`openManualDmAction`) ve her seferinde
 * kimlik çözümünü yeniden koşuyordu; Messenger/IG'de telefon hiç olmadığı için o yol kapanır —
 * devam kapısı konuşma kimliğiyle çalışır (15.15). Pencereyi yine gelen mesaj açar, damga şart.
 */
export async function recordFollowUpInboundAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await requireAdmin();
    const parsed = FollowUpInboundSchema.parse(input);
    const message = await recordInboundMessage(serviceDb(), {
      conversationId: parsed.conversationId,
      text: parsed.text,
      receivedAt: parsed.receivedAt,
    });
    refresh();
    return { data: { id: message.id }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Var olan konuşmaya GİDEN mesaj — pencereye dokunmaz.
 *
 * `templateName` verilmiyor ve verilemez: adım 1'de admin kendi telefonundan serbest metin yazıyor,
 * onaylı şablon gönderimi API işidir (15.11). Alan uydurulsaydı, defter hiç gönderilmemiş bir
 * şablonun ücretini raporlardı.
 */
export async function recordOutboundAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await requireAdmin();
    const parsed = RecordOutboundSchema.parse(input);
    const message = await recordOutboundMessage(serviceDb(), { conversationId: parsed.conversationId, text: parsed.text });
    refresh();
    return { data: { id: message.id }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Yürütücü modu (kullanıcı kararı 16.08): human · hybrid · ai — talep ekranıyla aynı üçlü.
 * Hedef enum'dan doğrulanır; aynı moda ikinci çağrı bir yarışın işaretidir ve reddedilir.
 * "Devral" da bu kapıdan geçer (`mode='human'`) — ayrı bir devralma ucu, aynı yazımın ikinci
 * adresi olurdu.
 */
export async function setConversationModeAction(
  conversationId: string,
  mode: TicketHandler,
): Promise<ActionResult<{ mode: TicketHandler }>> {
  try {
    await requireAdmin();
    /* Sohbette İKİ mod (15.13): `ai` burada da reddedilir, yalnız ekranda kapatılmaz — motoru
       olmayan bir modu yazan tek bir yol bile kalırsa "AI ilgileniyor" yalanı geri döner. */
    const target = ConversationHandlerEnum.parse(mode);
    const service = new ConversationService(serviceDb());
    const conversation = await service.getById(conversationId);
    if (!conversation) return { data: null, error: 'Konuşma bulunamadı — ekranı tazeleyin.' };
    if (conversation.handledBy === target) {
      return { data: null, error: 'Sohbet zaten bu modda — bir başkası az önce değiştirmiş olabilir, ekranı tazeleyin.' };
    }
    const updated = await service.setMode(conversationId, target);
    refresh();
    return { data: { mode: updated.handledBy }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** AI üretim sonucunun operatöre söylenecek hâli — Talepler ekranıyla aynı sözlük mantığı. */
const DRAFT_FAILURE: Record<string, string> = {
  not_configured: 'AI yapılandırılmamış — env dosyasına sağlayıcı anahtarı (AI_PROVIDER + API anahtarı) eklenmeli.',
  provider_error: 'AI sağlayıcısına ulaşılamadı — birazdan yeniden deneyin.',
  invalid_output: 'AI beklenen biçimde cevap üretemedi — yeniden deneyin; sürerse bildirin.',
  wrong_mode: 'Taslak yalnız hibrit modda üretilir — önce modu Hibrit yapın.',
  nothing_to_answer: 'Cevaplanacak yeni müşteri mesajı yok — son sözü zaten biz söylemişiz.',
  empty_thread: 'Bu konuşmada hiç mesaj yok — taslak üretilecek bir soru yok.',
  not_found: 'Konuşma bulunamadı — ekranı tazeleyin.',
};

/** **Taslak öner** (20.4) — hibrit konuşmada AI taslağını istek üzerine üretir, cron beklenmez. */
export async function suggestConversationDraftAction(conversationId: string): Promise<ActionResult<{ generated: true }>> {
  try {
    await requireAdmin();
    const outcome = await generateConversationDraft(serviceDb(), conversationId, { force: true });
    if (outcome.status === 'skipped' || outcome.status === 'failed') {
      return { data: null, error: DRAFT_FAILURE[outcome.reason] ?? outcome.reason };
    }
    refresh();
    return { data: { generated: true }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Hibrit taslağı tüket (16.08). Talep ekranından farkı: burada GÖNDERME yolu yok (kanal 15.7/15.11)
 * — taslağın tek dürüst çıkışı defter kutusuna taşınmaktır; operatör metni telefonundan gönderir,
 * gönderdiğini deftere işler. "Gönderildi" demeden tüketir, dönen metni kutu alır.
 */
export async function consumeConversationDraftAction(conversationId: string): Promise<ActionResult<{ draft: string }>> {
  try {
    await requireAdmin();
    const service = new ConversationService(serviceDb());
    const conversation = await service.getById(conversationId);
    if (!conversation) return { data: null, error: 'Konuşma bulunamadı — ekranı tazeleyin.' };
    const draft = conversation.aiDraftReply;
    if (!draft) return { data: null, error: 'Bekleyen AI taslağı yok — bu sırada tüketilmiş olabilir. Ekranı tazeleyin.' };
    await service.clearDraft(conversationId);
    refresh();
    return { data: { draft }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Sohbet için müşteri arama (15.16) — paylaşılan seçicinin kaynağı (`lib/customer-options`), talep
 * ve fiyat ekranlarıyla AYNI sorgu. Guard ve zarf burada, çünkü action sayfa klasöründe yaşar.
 */
export async function searchSocialCustomersAction(term: string): Promise<ActionResult<CustomerOption[]>> {
  try {
    await requireAdmin();
    const query = term.trim();
    if (!query) return { data: [], error: null };
    return { data: await searchCustomerOptions(query), error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Reddin operatöre görünen yüzü — her sebep FARKLI bir eylem öneriyor (15.19).
 *
 * Tek bir "bağlanamadı" cümlesi olsaydı operatör hangi kapıya gideceğini bilemezdi: kanıt
 * tutmadıysa müşteriden başka bir kanıt istenir, sohbet bu arada bağlandıysa ekran tazelenir.
 */
const LINK_REFUSAL: Record<'conversation_not_found' | 'customer_not_found' | 'proof_mismatch' | 'already_linked', string> = {
  conversation_not_found: 'Sohbet bulunamadı — ekranı tazeleyin.',
  customer_not_found: 'Seçilen müşteri kaydı bulunamadı — listeden yeniden seçin.',
  proof_mismatch:
    'Kanıt bu müşteri kaydıyla eşleşmedi — bağ kurulmadı. Müşteriden sipariş numarasını, kayıtlı e-postasını ya da telefonunu isteyin.',
  already_linked:
    'Sohbet bu sırada bir müşteriye bağlanmış — ekranı tazeleyin. Bağı değiştirmek Müşteriler ekranının birleştirme işidir.',
};

/**
 * **Kimliksiz sohbeti müşteriye bağla** (15.16) — Messenger/Instagram'da kimliğin TEK yolu.
 *
 * O kanallarda konuşma daima kimliksiz doğar (PSID/IGSID telefon taşımaz), yani "bu sohbet şu
 * müşteri" cümlesini ancak operatör kurabilir: müşteri sohbette kendini tanıtır, operatör kaydı
 * seçer. WhatsApp'ta da işe yarar ama orada istisnadır — kimlik numaradan çözülür, bu kapı yalnız
 * telefon/e-posta çakışmasında bağlanmadan açılmış sohbetler için gerekir.
 *
 * Dolu bağ EZİLMEZ ve yarış sessiz geçilmez: kapı `null` dönerse bu sırada başka biri bağlamıştır
 * ve operatöre söylenir (`ConversationService.linkCustomer` künyesi). Ayırma yolu YOK — yanlış bağı
 * düzeltmek Müşteriler ekranının birleştirme işidir (09.10).
 */
export async function linkConversationCustomerAction(input: unknown): Promise<ActionResult<{ customerId: string }>> {
  try {
    await requireAdmin();
    const staff = await requireAdmin();
    const parsed = LinkConversationCustomerSchema.parse(input);
    /* Kapı PAKETTE (`linkConversationCustomer`): kanıt doğrulaması burada değil, çünkü mobil
       sosyal kutunun bağlama ucu açıldığı gün aynı kuralın ikinci bir kopyası doğardı — ve
       atlanabilen bir güvenlik kapısı kapı değildir. Burası yalnız guard + zarf. */
    const sonuc = await linkConversationCustomer(serviceDb(), {
      conversationId: parsed.conversationId,
      customerId: parsed.customerId,
      proof: parsed.proof,
      // FK'li kolona giden şey PROFİL kimliğidir, auth kullanıcısı değil (`StaffUser` künyesi).
      staffId: staff.profileId,
    });
    if (sonuc.status === 'refused') return { data: null, error: LINK_REFUSAL[sonuc.reason] };
    refresh();
    return { data: { customerId: parsed.customerId }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * **Sohbetteki izni KAYDET** (15.12 · DOMAIN §11) — operatör karar vermez, müşterinin dediğini yazar.
 *
 * ── İKİ YERE BİRDEN YAZILIR VE İKİSİ AYRI SORUYU CEVAPLAR ───────────────────
 * `conversation.opt_in` bu SOHBETİN izni; `user_profiles.marketing_consent` MÜŞTERİNİN izni. Biri
 * ötekinin yerine geçmez: kimliksiz bir sohbette müşteri kaydı yoktur ama izin yine de kaydedilmeli
 * (kimlik sonra bağlanınca kaybolmasın), kimlikli müşterinin izni ise kanal boyunca taşınır ve
 * kampanya gönderiminin dayanağıdır.
 *
 * ── MÜŞTERİ KAYDINA YALNIZ WhatsApp YAZILIR ─────────────────────────────────
 * `marketing_consent` bugün yalnız `email` ve `whatsapp` anahtarlarını taşıyor (şemadan türer).
 * Messenger/Instagram izni Meta'nın kendi opt-in mekanizmasıyla gelecek; olmayan bir kanalı
 * WhatsApp'ın kutusuna yazmak, bir gün yanlış kanaldan kampanya göndermenin dayanağı olurdu.
 * O kanallarda kayıt sohbet düzeyinde kalır ve ekran bunu söyler.
 *
 * İzin bir KANITTIR: ne zaman ve nereden verildiği yazılmadan "izin var" demek GDPR'da bir şey
 * ifade etmez — damgayı `setOptIn` (sohbet) ve `updateCustomerPreferences` (müşteri, `source`
 * alanıyla) atıyor; bu kapı ikisini tek operatör hareketinde tutuyor.
 */
export async function recordConversationOptInAction(input: unknown): Promise<ActionResult<{ granted: boolean }>> {
  try {
    await requireAdmin();
    const parsed = ConversationOptInSchema.parse(input);
    /* Çift yazımın kuralı PAKETTE (`recordConversationOptIn`, 24.08): burada durduğu sürece
       sınanamıyordu — action guard'la başlıyor, guard oturum istiyor, depoda taklit yok. Kural
       taşınınca mobil izin ucu açıldığında ikinci bir kopyası da doğmayacak. */
    const sonuc = await recordConversationOptIn(serviceDb(), parsed);
    if (sonuc.status === 'refused') return { data: null, error: 'Konuşma bulunamadı — ekranı tazeleyin.' };

    refresh();
    return { data: { granted: parsed.granted }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Sohbetten talep açma — `ticket.conversation_id`'yi dolduran TEK yol.
 *
 * Bağ 15.1'de kuruldu ama hiçbir yazma yolu onu doldurmuyordu; Talepler ekranı "bağlı konuşma var"
 * satırını çizip hiç gösteremiyordu. `source: 'admin'` + `authorId`: ilk sözü operatör söylüyor ve
 * müşteriye teyit maili GİTMİYOR (16.4 kararı) — müşteri kendi yazmadığı bir metni okumamalı.
 * (Kanal ne olursa olsun kaynak 'admin' DOĞRU: talebi konuşmanın kendisi değil, onu okuyan operatör
 * açıyor; kanal bağı `conversation_id` üzerinden zaten duruyor. `ticket_source`'a messenger/
 * instagram değerleri, talebi KANALIN açtığı gün — ajan 15.14 — eklenir.)
 */
export async function openConversationTicketAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requireAdmin();
    const parsed = ConversationTicketSchema.parse(input);
    const result = await openTicket({
      customerId: parsed.customerId,
      conversationId: parsed.conversationId,
      source: 'admin',
      type: parsed.type,
      body: parsed.body,
      subject: parsed.subject?.trim() || null,
      authorId: actor.profileId,
    });
    if (!result.ok) return { data: null, error: `Talep açılamadı (${result.reason}).` };
    refresh();
    return { data: { id: result.data.id }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

// ── Kimlik çapası (04.10) ────────────────────────────────────────────────────
// DOMAIN §10. Numaranın kanıtlanması "bu hat BUGÜN bu kişide" der; çapa "bu numaranın GEÇMİŞİ
// kimin" sorusunu cevaplar. Devredilmiş hattın yeni sahibi hattı da OTP'yi de meşru olarak alır —
// çözen tek şey, şüphe doğmadan ÖNCE kurulmuş bir sırdır.
//
// **Kapılar OPERATÖRDE, ajanda değil — bugünlük.** DOMAIN "ilk sipariş tamamlanınca e-posta
// önerilir" diyor ve o otomasyon ajanın işi (15.8'in izin sorma deseniyle aynı yer). Operatör
// kapısı onun YERİNE değil ÖNÜNE geçiyor: kural bir kez burada yazılıyor, ajan doğduğunda aynı
// paket fonksiyonunu çağırıyor. 15.16/15.19'un izlediği sıranın aynısı — önce insan eli, sonra
// otomasyon.
//
// **"Kod doğrula" kutusu YOK ve olmayacak** (DOMAIN §10): doğrulama yalnız müşterinin KENDİ
// numarasından gelen mesajla olur (`answerEmailAnchor` · `verifySecurityCode`, ikisi de `phone`
// alıyor). Telefonda arayan müşteriyi bu ekrandan doğrulamanın yolu yoktur ve olmaması tasarımdır.

/**
 * **E-posta çapasını başlat** — kod müşterinin adresine gider, cevabı WhatsApp'tan bekleriz.
 *
 * Kanıtın gücü çaprazlıktan geliyor: kod, doğrulanan kanaldan BAŞKA bir kanaldan geçiyor. Bu yüzden
 * kodu buradan sohbete yazmıyoruz — yazsaydık kanıt kendi kendini doğrulayan bir tur olurdu.
 */
export async function startEmailAnchorAction(input: unknown): Promise<ActionResult<{ email: string }>> {
  try {
    await requireAdmin();
    const parsed = AnchorEmailSchema.parse(input);

    const conversation = await new ConversationService(serviceDb()).getById(parsed.conversationId);
    if (!conversation?.customerId) return { data: null, error: 'Sohbet bir müşteriye bağlı değil — önce bağlayın.' };

    const sonuc = await startEmailAnchor(serviceDb(), conversation.customerId, parsed.email);
    if (sonuc.status === 'throttled') {
      return { data: null, error: `Bu adrese çok sık kod istendi. ${Math.ceil(sonuc.retryAfterSec / 60)} dk sonra deneyin.` };
    }
    if (sonuc.status !== 'ok') {
      // Cümle EKRANDA kurulur, anahtar pakette: aynı retler mobil/ajan kapısı doğduğunda başka
      // cümlelerle karşılanacak ve o cümleleri yüzey yazar.
      const cumle: Record<typeof sonuc.status, string> = {
        invalid_email: 'Adresi okuyamadık — yazımını kontrol edin.',
        profile_not_found: 'Müşteri kaydı bulunamadı — ekranı tazeleyin.',
        already_anchored: 'Bu müşterinin çapası zaten var; ikinci bir çapa kurulmaz.',
        email_locked: 'Kartta başka bir adres yazılı. Adres değiştirmek birleştirme işidir (Müşteriler ekranı).',
        // Bekleyen adres SATIRDA DURUYOR: operatör tekrar deneyebilir, ikinci istek eskisini
        // geçersizler (0003) — yani "gitmedi" hâli müşteriyi çapasız bırakmıyor, geciktiriyor.
        send_failed: 'Kod maili gönderilemedi. Birazdan tekrar deneyin.',
      };
      return { data: null, error: cumle[sonuc.status] };
    }

    refresh();
    return { data: { email: sonuc.email }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * **6 haneli güvenlik kodunu ver** — e-posta bağlamak İSTEMEYENİN tek çapası.
 *
 * Kod sohbete YAZILIR (`issueAndSendSecurityCode`), operatörün ekranına değil: DOMAIN §10 "aynı
 * konuşmada verilir" diyor ve elle kopyalanan bir sır, kopyalanırken yanlış sohbete düşebilir.
 * Gönderim yapılandırılmamışsa kod yine de üretilmiş olur ve operatöre DÖNER — sır zaten satırda
 * özetli, geri almanın yolu yok; onu saklamak müşteriyi çapasız bırakmak olurdu.
 *
 * **Sır şüphe doğmadan ÖNCE kurulur:** dönüş anında üretilen bir kod hiçbir şey kanıtlamaz — kim
 * çıkarsa kodu o belirler ve geçmişi o devralır.
 *
 * **Düğme artık tek yol DEĞİL** (26.08): siparişi olan çapasız müşteriye kod, gelen ilk mesajda
 * kendiliğinden gidiyor (`offerAnchorIfDue`). Düğme duruyor çünkü operatörün elinde kalması gereken
 * bir kapı var — otomatik yolun kapsamadığı hâller (kanal dışından gelen sipariş, gönderimi düşmüş
 * kod) ve müşterinin telefonda isteyebileceği durum.
 */
export async function issueSecurityCodeAction(conversationId: string): Promise<ActionResult<{ code: string | null }>> {
  try {
    await requireAdmin();

    const conversation = await new ConversationService(serviceDb()).getById(conversationId);
    if (!conversation?.customerId) return { data: null, error: 'Sohbet bir müşteriye bağlı değil — önce bağlayın.' };

    // Üretim + gönderim TEK gövdede (`issueAndSendSecurityCode`): aynı kodu otomatik kapı da
    // veriyor (gelen mesajda, siparişi olan çapasız müşteriye) ve müşteriye söylenen cümlenin iki
    // kopyası olsaydı biri gün gelip ötekinden ayrılırdı.
    const sonuc = await issueAndSendSecurityCode(serviceDb(), messageSenderFor(process.env.META_ACCESS_TOKEN), {
      conversationId,
      customerId: conversation.customerId,
    });
    // Gönderim tuttuysa kodu ekrana DÖNDÜRMÜYORUZ: müşteride, bizde özeti var; üçüncü bir kopya
    // operatörün ekranında durmasın. Düştüyse dönüyor — kodu iletecek olan artık insandır.
    if (sonuc.status === 'sent' || sonuc.status === 'send_failed') {
      refresh();
      return { data: { code: sonuc.status === 'sent' ? null : sonuc.code }, error: null };
    }

    const cumle: Record<typeof sonuc.status, string> = {
      profile_not_found: 'Müşteri kaydı bulunamadı — ekranı tazeleyin.',
      already_anchored: 'Bu müşterinin e-posta çapası var; kod gerekmiyor.',
    };
    return { data: null, error: cumle[sonuc.status] };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
