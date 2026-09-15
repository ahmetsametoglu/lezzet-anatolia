'use server';

import { revalidatePath } from 'next/cache';
import {
  generateConversationDraft,
  metaSenderFromEnv,
  recordConversationOptIn,
  sendOutboundMessage,
  setDefaultConversationHandler,
} from '@lezzet/application';
// Alt yoldan (`settings-keys` emsali): barrel o gün başka şeritlerin elindeydi (07.09).
import { startCartLink } from '@lezzet/application/cart/link';
import { linkTail } from '@lezzet/application/cart/link-text';
import { ConversationService, CustomerInboxService, serviceDb } from '@lezzet/database';
import { ConversationHandlerEnum, DEFAULT_PAGE_SIZE, type CartLinkPurpose, type KeysetCursor, type Page, type TicketHandler } from '@lezzet/types';
import { requireAdmin } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { openTicket } from '@/lib/ticket/write';
import { toInboxRows } from './social-read';
import { ConversationOptInSchema, ConversationTicketSchema, RecordOutboundSchema, type InboxRowView } from './social-types';
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
// ── GELEN MESAJ YALNIZ KANALDAN ──────────────────────────────────────────────
// Gelen mesaj webhook'tan yazılır (15.7); elle kaydı 15.36'da kalktı (kullanıcı kararı 15.09 —
// operatörün "gelen" diye yazdığı satır müşterinin söylemediği bir cümle olabilirdi). Giden mesaj
// gönderim kapısından gider (`sendOutboundAction`, 06.09).

function refresh(): void {
  revalidatePath(SOCIAL_PATH);
}

/**
 * Kuyruğun SONRAKİ sayfası — imleç `null` ise İLKİ: yüzen mesaj penceresi (15.32) listesini buradan okur
 * (sayfanın kendi ilk sayfası sunucuda okunur). Süzgeç ADRESTEN okunur, istemciden gelen bir nesneden değil: devam eden
 * sayfa ilk sayfayla aynı ölçüte uymalı ve o ölçüt tek yerde (`social-url`) tanımlı — kanal çipi de
 * dahil. Satırlar KİŞİ başına (15.38 · `customer_inbox`): aynı kişi iki sayfaya bölünmez, gruplama görünümde.
 */
export async function loadMoreConversationsAction(search: string, cursor: KeysetCursor | null): Promise<ActionResult<Page<InboxRowView>>> {
  try {
    await requireAdmin();
    const urlState = parseSocialUrl(Object.fromEntries(new URLSearchParams(search)));
    const page = await new CustomerInboxService(serviceDb()).list(
      { awaitingReply: urlState.f === 'awaiting' ? true : undefined, source: channelSource(urlState.ch) },
      cursor ?? undefined,
      DEFAULT_PAGE_SIZE,
    );
    return { data: { rows: toInboxRows(page.rows, new Date()), nextCursor: page.nextCursor }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/*
  GÖNDERİM REDDİ → OPERATÖRÜN CÜMLESİ.

  Sözlük burada, çünkü ayrım operatöre GÖRÜNMEK zorunda: `refused` bizim kuralımızdır (tekrar
  denemek anlamsız, önce bir şeyin değişmesi gerekir), `failed` sağlayıcı tarafıdır (tekrar
  denemek anlamlı olabilir). Tek kovaya atmak, "yeniden dene"yi yanlış yere koydururdu.

  Tanınmayan sebep GİZLENMEZ, ham hâliyle gösterilir: sağlayıcı yarın yeni bir kod döndürdüğünde
  operatörün elinde aranabilir bir dize olsun — "bir hata oluştu" cümlesi teşhisi öldürür.
*/
const SEND_REFUSAL: Record<string, string> = {
  conversation_not_found: 'Konuşma bulunamadı — ekranı tazeleyin.',
  template_wrong_channel: 'Kalıp mesaj yalnız WhatsApp konuşmasına gönderilebilir.',
  window_closed: 'Cevap süresi doldu — serbest metin gönderilemez. WhatsApp’ta onaylı kalıp mesaj gerekir.',
  window_never_opened: 'Müşteri bu kanaldan size hiç yazmadı — cevap penceresi hiç açılmadı.',
  account_ref_missing: 'Bu konuşma hangi işletme hesabına geldiğini taşımıyor; cevap yönlendirilemez.',
  not_configured: 'Gönderim kanalı yapılandırılmadı (META_ACCESS_TOKEN yok) — mesaj GÖNDERİLMEDİ.',
};

/**
 * Var olan konuşmaya GİDEN mesaj — **artık gerçekten gönderilir** (06.09).
 *
 * ── NEDEN DEĞİŞTİ: DEFTER KUTUSUNUN DAYANAĞI ÇÖKTÜ ──────────────────────────
 * Kutu bugüne kadar bir DEFTER kutusuydu ve gerekçesi gerçekti: yazışma operatörün telefonundan
 * yürüyor, ekran yalnız kaydını tutuyordu. O gerekçe WhatsApp'ta artık YOK — numara Cloud API'ye
 * kaydedildi ve Meta'nın kuralı gereği kayıttan sonra WhatsApp Business uygulamasıyla
 * kullanılamıyor (`build/15 Netleşecekler`). Yani telefondan yazan kimse kalmadı: ekran
 * göndermezse cevap hiç gitmiyor. "Deftere işle" düğmesi o gün sessizce bir yalana dönüştü.
 *
 * ── SIRA: ÖNCE GÖNDER, SONRA YAZ ────────────────────────────────────────────
 * Kararı `sendOutboundMessage` veriyor ve burada tekrarlanmıyor: gönderim geri alınamaz (müşteri
 * okumuştur), defter yazımı telafi edilebilir. `sent` dönerken `message: null` olabilir — gönderim
 * OLDU, satır yazılamadı; o hâl bir başarıdır ve öyle raporlanır.
 *
 * `templateName` hâlâ verilmiyor: onaylı şablonumuz yok (15.11). Alan uydurulsaydı Meta `132001`
 * döndürürdü ve defter hiç gönderilmemiş bir şablonun ücretini raporlardı.
 */
export async function sendOutboundAction(input: unknown): Promise<ActionResult<{ id: string | null }>> {
  try {
    await requireAdmin();
    const parsed = RecordOutboundSchema.parse(input);
    const outcome = await sendOutboundMessage(serviceDb(), metaSenderFromEnv(), {
      conversationId: parsed.conversationId,
      text: parsed.text,
      author: 'admin',
    });
    refresh();

    if (outcome.status === 'sent') return { data: { id: outcome.message?.id ?? null }, error: null };
    if (outcome.status === 'refused') {
      return { data: null, error: SEND_REFUSAL[outcome.reason] ?? `Gönderilemedi (${outcome.reason}).` };
    }
    // Çeviri düştü (15.28): mesaj GİTMEDİ ve bu bizim tarafımız, sağlayıcı değil — cümle onu
    // "sağlayıcı" diye okutmamalı. Türkçesi müşteriye gönderilmedi; operatör birazdan yeniden dener.
    if (outcome.reason === 'translation_failed') {
      return { data: null, error: 'Mesaj çevrilemedi, o yüzden GÖNDERİLMEDİ — birazdan tekrar deneyin.' };
    }
    // `failed` = sağlayıcı reddetti. Sebep ham geçiyor (`meta_131030: …` gibi) — operatör onu
    // arayabilsin; ayrıca yeniden denemenin anlamlı olup olmadığı söyleniyor.
    return {
      data: null,
      error: outcome.retryable
        ? `Sağlayıcı şu an gönderemedi (${outcome.reason}) — birazdan tekrar deneyin.`
        : `Sağlayıcı reddetti (${outcome.reason}) — tekrar denemek aynı sonucu verir.`,
    };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Yeni sohbetlerin VARSAYILAN yürütücüsü (15.30 · kullanıcı kararı 07.09) — AYARA yazar, sohbete değil.
 *
 * Ayarlar ekranındaki satırın aynısı; operatör sohbet kuyruğundayken oraya gitmek zorunda kalmasın
 * diye buradan da çevriliyor. Açık sohbetlere dokunmaz (`open_conversation` yalnız doğuşta yazar).
 */
export async function setDefaultConversationModeAction(mode: unknown): Promise<ActionResult<{ mode: TicketHandler }>> {
  try {
    await requireAdmin();
    const parsed = ConversationHandlerEnum.parse(mode);
    await setDefaultConversationHandler(serviceDb(), parsed);
    refresh();
    return { data: { mode: parsed }, error: null };
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

// ── Kimlik çapası (04.10 · 15.40) ────────────────────────────────────────────
// Panelde çapa KAPISI YOK (kullanıcı kararı 15.09: "OTP kodu üretmeye gerek yok, bir buton link göndersin,
// müşteri kendi kendine bağlasın"): operatör e-postaya kod göndermez, sohbete 6 haneli kod yazmaz. Çapayı
// müşteri kurar — hesap bağlantısını (`sendAccountLinkAction`) açıp e-postasıyla girer; giriş hesabı olan
// müşteri çapalıdır (`anchorStateOf`). Hesabını hiç bağlamayan müşterinin güvenlik kodu otomatik akışta
// (`offerAnchorIfDue`, gelen mesajda) duruyor. "Kod doğrula" kutusu da yok (DOMAIN §10).

/**
 * **Sohbet bağlantısını gönder** — sepet (15.21 · kullanıcı kararı 07.09) ya da hesap (15.16 ·
 * kullanıcı tasarımı 08.09); operatör yarısı.
 *
 * Ajanın `sepet_baglantisi` / `hesap_baglantisi` araçlarının insan eli: sohbeti personel yürütüyorsa
 * ajan araçları çalışmaz ve müşteriyi sepete ya da hesabına taşıyacak tek yol bu düğmeler. Bağlantı
 * AYNI kapıdan üretilir (`startCartLink` — yeni jeton aynı amaçlı eskisini geçersizler) ve AYNI
 * kuyrukla gider (`linkTail`): ajanın gönderdiğiyle operatörün gönderdiği ayrışamaz. Bağlantıyı açan
 * kişi giriş yapınca sepet ve (kimliksiz sohbette) kimlik hesabına geçer — `cart/link.ts` künyesi.
 *
 * Gönderim `sendOutboundMessage`tan: pencere kapalıysa reddedilir ve sebebi operatöre söylenir
 * (`SEND_REFUSAL`). Jeton yine de üretilmiş olur ve bir hafta bekler — pencere açılınca yeniden
 * gönderilebilir, ikinci basış yenisini üretir.
 */
export async function sendCartLinkAction(conversationId: string): Promise<ActionResult<{ id: string | null }>> {
  return sendChatLink(conversationId, 'cart');
}

/** Hesap bağlantısı (15.16) — sepetsiz sohbeti müşteri KENDİSİ bağlasın; gövde yukarıdakiyle tek. */
export async function sendAccountLinkAction(conversationId: string): Promise<ActionResult<{ id: string | null }>> {
  return sendChatLink(conversationId, 'account');
}

async function sendChatLink(conversationId: string, purpose: CartLinkPurpose): Promise<ActionResult<{ id: string | null }>> {
  try {
    await requireAdmin();

    const link = await startCartLink(serviceDb(), { conversationId, purpose });
    if (link.status !== 'ok') {
      const cumle: Record<typeof link.status, string> = {
        conversation_not_found: 'Konuşma bulunamadı — ekranı tazeleyin.',
        unavailable: 'Bağlantı üretilemedi — bir kez daha deneyin.',
      };
      return { data: null, error: cumle[link.status] };
    }

    const outcome = await sendOutboundMessage(serviceDb(), metaSenderFromEnv(), {
      conversationId,
      // Ajanın cevabına eklenen kuyruğun aynısı (`withCartLink` biçimi): cümle, altında bağlantı.
      text: linkTail({ url: link.url, purpose }),
      author: 'admin',
    });
    refresh();

    if (outcome.status === 'sent') return { data: { id: outcome.message?.id ?? null }, error: null };
    if (outcome.status === 'refused') return { data: null, error: SEND_REFUSAL[outcome.reason] ?? `Gönderilemedi (${outcome.reason}).` };
    return { data: null, error: `Sağlayıcı reddetti (${outcome.reason}) — bağlantı üretildi, pencere açılınca yeniden deneyin.` };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
