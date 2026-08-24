import { ConversationService, OrderService, UserProfileService } from '@lezzet/database';
import { normalizeEmail, normalizePhone } from '@lezzet/helper';
import { logger } from '@lezzet/observability';
import type { Conversation, LinkProofKind } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * **KİMLİKSİZ SOHBETİ MÜŞTERİYE BAĞLAMA — KANITLI KAPI** (15.19).
 *
 * ── NEDEN BİR KAPI, NEDEN BURADA ────────────────────────────────────────────
 * Messenger/Instagram'da kimliğin başka otomatik yolu YOK: PSID/IGSID telefon taşımaz, konuşma
 * daima kimliksiz doğar ve "bu sohbet şu müşteri" cümlesini ancak operatör kurabilir. Bağ kurulur
 * kurulmaz yalnız ekran değil, **ajanın araçları da** o müşteriye açılır (`ticket/support-tools.ts`
 * kimliğe kapatılmıştır) — yani yanlış bağ tek bir alanı değil, o müşterinin verisinin TAMAMINI
 * açar. Kapı bu yüzden var.
 *
 * `@lezzet/application`ta, çünkü **atlanabilir bir güvenlik kapısı, kapı değildir**: web action'ı
 * bugün buradan geçiyor; mobil sosyal kutunun uçları (`/social/*`) zaten var ve bağlama ucu zaman
 * meselesi. İkinci yüzey kendi kapısını yazsaydı, kural iki yerde yaşar ve biri gevşerdi
 * (`recordInbound/OutboundMessage`ın terfi gerekçesinin aynısı).
 *
 * ── KANIT SUNUCUDA DOĞRULANIR, GÖZLE DEĞİL ──────────────────────────────────
 * Operatör "kontrol ettim" demez; müşterinin söylediği DEĞERİ geçer ve doğrulamayı bu kapı yapar.
 * Onay kutusu bir KAYIT olurdu, bir kapı değil — acelede tıklanır ve hiçbir şeyi durdurmaz.
 *
 * Üç kanıt da **kişinin bilmesi gereken** şeydir: sipariş referansı (o müşterinin siparişi mi),
 * kayıtlı e-posta ya da telefon (normalize edilip kayıtla karşılaştırılır). Kaçış yolu YOK —
 * kaydı olan bir müşteri bunlardan birini bilir; hiçbirini bilmiyorsa zaten bağlanmamalıdır.
 *
 * ── DEĞER SAKLANMAZ, TÜRÜ SAKLANIR ──────────────────────────────────────────
 * Satıra `linked_by` · `linked_at` · `link_proof` yazılır. Sorulacak soru *"hangi kanıtla
 * bağlandı"*dır, *"e-postası neydi"* değil; değeri saklamak gereksiz bir kişisel veriyi ikinci bir
 * yere kopyalamak olurdu (`CLAUDE §1`). Log da aynı kuralda: kimlik ve tür yazılır, değer yazılmaz.
 *
 * ── YARIŞI DB ÇÖZER ─────────────────────────────────────────────────────────
 * Yazım `updateIfNull` ile koşullu: dolu bağ EZİLMEZ ve kaybeden çağrı görünür bir ret alır
 * (`already_linked`). Bir birleştirme kararını sessizce ezmek, bağlanmamış bir sohbetten pahalıdır.
 */

/** Operatörün sunduğu kanıt — türü kapalı liste, değeri serbest metin (kişi ne söylediyse). */
export interface LinkProof {
  kind: LinkProofKind;
  value: string;
}

export type LinkOutcome =
  | { status: 'linked'; conversation: Conversation }
  /**
   * Reddin SEBEBİ ayrı ayrı taşınır: "sohbet yok" ile "kanıt tutmadı" operatöre farklı şey
   * söyler — biri ekranı tazeletir, öteki müşteriden başka bir kanıt istetir.
   */
  | { status: 'refused'; reason: 'conversation_not_found' | 'customer_not_found' | 'proof_mismatch' | 'already_linked' };

/**
 * Kanıtın seçilen MÜŞTERİYE karşı doğrulanması.
 *
 * `order_ref` doğrulaması müşteriye kapatılmış kapıdan geçer (`findByReference(ref, customerId)` —
 * kendisi de bir güvenlik kararıdır, 10.08): referans başka birinin siparişine aitse eşleşme
 * bulunamaz ve kanıt tutmaz.
 *
 * E-posta/telefon NORMALİZE edilerek karşılaştırılır: müşteri telefonu "06 12 34 56 78" diye
 * söyler, kayıtta "+33612345678" durur — ham karşılaştırma doğru kanıtı reddederdi.
 */
async function proofHolds(db: SupabaseClient, customerId: string, proof: LinkProof): Promise<boolean> {
  /* Tip `string` diyor ama kapı FIRLATMAK yerine REDDETMELİ (ölçüldü 24.08: bir fikstür `null`
     geçirdi ve doğrulama `.trim()` üzerinde çöktü). Fırlayan bir güvenlik kapısı, çağıranın hata
     yolunda ne yaptığına bağımlı olur; reddeden kapı her yolda aynı şeyi yapar. */
  const value = typeof proof.value === 'string' ? proof.value.trim() : '';
  if (!value) return false;

  if (proof.kind === 'order_ref') {
    return (await new OrderService(db).findByReference(value, customerId)) !== null;
  }

  const profile = await new UserProfileService(db).getById(customerId);
  if (!profile) return false;

  if (proof.kind === 'email') {
    const said = normalizeEmail(value);
    return said !== null && profile.email !== null && profile.email === said;
  }
  const said = normalizePhone(value);
  return said !== null && profile.phone !== null && profile.phone === said;
}

export async function linkConversationCustomer(
  db: SupabaseClient,
  input: { conversationId: string; customerId: string; proof: LinkProof; staffId: string | null },
): Promise<LinkOutcome> {
  const conversations = new ConversationService(db);

  const conversation = await conversations.getById(input.conversationId);
  if (!conversation) return { status: 'refused', reason: 'conversation_not_found' };
  // Erken çıkış operatöre NET bir cümle için; yarışın gerçek hakemi aşağıdaki koşullu yazımdır.
  if (conversation.customerId) return { status: 'refused', reason: 'already_linked' };

  const customer = await new UserProfileService(db).getById(input.customerId);
  if (!customer) return { status: 'refused', reason: 'customer_not_found' };

  if (!(await proofHolds(db, input.customerId, input.proof))) {
    /* Tutmayan kanıt bir ARIZA değil, kapının işini yapmasıdır — `captureError` değil `info`.
       Ama izsiz de geçmez: aynı sohbette üst üste tutmayan kanıtlar, birinin kendini başkası
       gibi tanıtmaya çalıştığının tek işaretidir. */
    logger.info(
      { context: 'messaging/link', conversationId: input.conversationId, customerId: input.customerId, staffId: input.staffId, proof: input.proof.kind },
      'sohbet bağlama: kanıt tutmadı — bağ kurulmadı',
    );
    return { status: 'refused', reason: 'proof_mismatch' };
  }

  const linked = await conversations.linkCustomer(input.conversationId, {
    customerId: input.customerId,
    linkedBy: input.staffId,
    proof: input.proof.kind,
  });
  if (!linked) return { status: 'refused', reason: 'already_linked' };

  logger.info(
    { context: 'messaging/link', conversationId: linked.id, customerId: input.customerId, staffId: input.staffId, proof: input.proof.kind },
    'sohbet müşteriye bağlandı',
  );
  return { status: 'linked', conversation: linked };
}
