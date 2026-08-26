'use server';

import { revalidatePath } from 'next/cache';
import { AssistantProposalService, serviceDb } from '@lezzet/database';
import { applyProposal, modeOf, KIND_META } from '@lezzet/application';
import { captureError, SOURCES } from '@lezzet/observability';
import { requireStaff } from '@/lib/guard';
import { getErrorMessage } from '@/lib/error';
import type { ActionResult } from '@/lib/error';
import type { ApplyOutcome, RejectOutcome } from '@/lib/assistant/assistant-types';

/**
 * Asistan önerilerinin KARAR KAPILARI (22.3) — ve bu iki fonksiyon, kurgunun tamamının dayandığı yer.
 *
 * **Onay yalnız BURADAN verilir.** MCP yüzeyinde onay aracı yoktur ve olmayacaktır: asistan kendi
 * önerisini uygulayamaz (`AI_ADMIN_ASSISTANT §5`). Guard ilk satırda — karar bir PERSONEL
 * kararıdır, kimliği de satıra o yüzden yazılır.
 *
 * **Dosya operasyon şeridinin sayfa klasöründe ama sahibi denetim** (paralel çalışma sınırı,
 * `docs/talep/operasyon-asistan-kuyrugu-veri-sozlesmesi.md §3`): ekran bunları yalnız çağırır.
 */

/**
 * Öneriyi uygular. Sıra ŞEMANIN dayattığı sıradır:
 *
 *   1. `claimForApply` — satırı `pending`ten çıkarır ve kararı damgalar. Yarışı VERİTABANI çözer:
 *      ikinci sekme aynı öneriyi uygulamaya kalkarsa `null` döner ve iş hiç başlamaz.
 *   2. gerçek iş — mevcut servis/motor kapısından (kuyruk ikinci bir yazma yolu açmaz).
 *   3. `markApplied` / `markFailed`.
 *
 * Kilit satırı iyimser değil KÖTÜMSER park eder (`failed`): süreç 2. adımda ölürse satır
 * "uygulanamadı" olarak kalır ve patron sebebini görür — sessiz kayıp yok.
 */
export async function applyProposalAction(id: string): Promise<ActionResult<ApplyOutcome>> {
  const staff = await requireStaff();
  const db = serviceDb();
  const service = new AssistantProposalService(db);

  try {
    // ── KENDİ FORMU OLAN TİP BURADAN UYGULANAMAZ (22.5 · 22.8) ──────────────
    // Kapı KODDA, ekranın iyi niyetinde değil: ekran düğmeyi gizlemeyi unutsa ya da eski bir sekme
    // açık kalsa, geri alınamaz bir eylem (bildirim · stok · defter · satış fiyatı) DÜZENLENMEDEN
    // koşardı — kuyruğun tek kapılı hâlinde şikâyet edilen tam olarak buydu. Süzgeç `pending`
    // satırı hiç tüketmez: öneri kuyrukta kalır ve doğru yerden uygulanır.
    //
    // **`inline` de aynı kapıdan geçmez ve bu bilinçli (22.8):** o tiplerde karar kuyruğun içinde
    // veriliyor ama kararı YAZAN yine varlığın kendi eylemi (`setOfferPriceAction` → `withProposal`),
    // çünkü düzenlenmiş değer buraya değil oraya gidiyor. Buradan uygulansaydı asistanın ÖNERDİĞİ
    // ham fiyat yazılırdı — operatörün az önce elleriyle değiştirdiği sayı sessizce yok sayılarak.
    const pending = await service.getById(id);
    const pendingMode = pending ? modeOf(pending.kind) : null;
    if (pending && pendingMode === 'inline') {
      return { data: { status: 'inline', target: KIND_META[pending.kind].target }, error: null };
    }

    // PROFİL kimliği: `decided_by` `user_profiles`'a FK'li (`0042_assistant_proposal.sql`). Auth
    // kimliği yazılırsa satır `23503` ile reddedilir ve arıza ilk denemede görünür — iki kimliğin
    // ayrı tutulması bu nöbeti kuruyor (`lib/guard` künyesi, 04.11).
    const claimed = await service.claimForApply(id, staff.profileId);
    // Hata DEĞİL bilgi: başka bir sekmede/kişide karar verilmiş. Ekran bunu nazikçe söyler.
    if (!claimed) return { data: { status: 'gone' }, error: null };

    try {
      const result = await applyProposal(db, claimed);
      const applied = await service.markApplied(id, result);
      revalidatePath('/operations/assistant');
      return { data: { status: 'applied', result: (applied.result as Record<string, string>) ?? {} }, error: null };
    } catch (err) {
      // MOTORUN reddi burada yakalanır ve satıra yazılır — "patron istemedi" ile "sistem yapamadı"
      // aynı kovaya düşmesin diye ayrı bir durum (`failed`). Sebep ekranda görünür.
      const reason = getErrorMessage(err);
      await service.markFailed(id, reason);
      void captureError(err, { source: SOURCES.webAction, context: { proposalId: id, phase: 'apply' } });
      revalidatePath('/operations/assistant');
      return { data: { status: 'failed', error: reason }, error: null };
    }
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Öneriyi reddeder. **Satır SİLİNMEZ**, ret notuyla geçmişe düşer — "bunu neden reddetmişiz"
 * sorusunun cevabı orada kalır (B2B onay ekranının dersi).
 */
export async function rejectProposalAction(id: string, note?: string): Promise<ActionResult<RejectOutcome>> {
  const staff = await requireStaff();
  try {
    const rejected = await new AssistantProposalService(serviceDb()).decide(id, {
      status: 'rejected',
      // PROFİL kimliği — yukarıdaki `claimForApply` ile aynı gerekçe (FK `user_profiles`).
      decidedBy: staff.profileId,
      note: note?.trim() || null,
    });
    revalidatePath('/operations/assistant');
    return { data: rejected ? { status: 'rejected' } : { status: 'gone' }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
