import 'server-only';
import { AssistantProposalService, serviceDb } from '@lezzet/database';
import type { ApplyResult } from '@lezzet/application';
import { captureError, SOURCES } from '@lezzet/observability';

/**
 * ÖNERİNİN KAYDA DÖNÜŞMESİ — kuyruk satırıyla işin tek turda koşması (22.5 · 22.24).
 *
 * ── BU DOSYA BİR ZAMANLAR "DEVİR"İN EVİYDİ, ARTIK DEĞİL (söküldü 26.08) ─────
 * Kuyruk ilk hâlinde tek kapılıydı (onayla/reddet) ve gerçek kullanım bunu çürüttü: *"bölgeye
 * hangi posta kodlarının gireceğine haritaya bakmadan karar veremem"*. Geri alınamaz üç tip
 * (`zone_extend` · `stock_intake` · `money_movement`) o yüzden kuyrukta uygulanmıyor, ilgili
 * operasyon ekranı ön doldurulup karar orada veriliyordu — buna DEVİR deniyordu.
 *
 * **Üçünün üçü de kuyruğun içine döndü** (22.18 para · 22.23 mal kabul · 22.36 bölge, haritasıyla).
 * Devrin gerekçesi *"geri alınamaz, karar öncesi düzenleme şart"*tı ve o şart hiç kalkmadı —
 * düzenleme hâlâ karardan önce, yalnız formun YERİ değişti: ekran yerine diyalog.
 *
 * **Ölçüm (26.08):** `KIND_META`da `handoff` modunda tip KALMADI — on bir tipin onu `inline`, biri
 * `draft_then_edit`. Yani `readHandoffProposal` (`modeOf(kind) !== 'handoff'` kontrolüyle başlardı)
 * çağrıldığı her yerde **zaten `null` dönüyordu**; üç ekran aylardır boş devir alıyordu. Ölü kod
 * zararsız değildi: okuyan ajana "bu tip devrediliyor" diye yanlış bilgi veriyordu ve bir gün biri
 * o yolu düzeltmeye çalışırdı.
 *
 * ── İKİNCİ YAZMA YOLU AÇILMIYOR ─────────────────────────────────────────────
 * Kalan tek fonksiyon hiçbir iş tablosuna dokunmaz. Ekranın kendi action'ı ne yapıyorsa onu yapar;
 * buradaki sarmalayıcı yalnız kuyruk satırının hâlini yönetir. Öneriden gelen kayıt ile elle
 * girilen kayıt AYNI yoldan doğar — ve sıra tek yerde durduğu için `claimForApply` hiçbir çağrıda
 * atlanamaz (atlansaydı aynı öneri iki kez uygulanabilirdi; kuyruğun tek vaadi de o).
 */

/**
 * Ekranın kaydetme işini kuyruk satırıyla birlikte koşar.
 *
 * Sıra ŞEMANIN dayattığı sıradır (`assistant_proposal_decided_status`): önce satır `pending`ten
 * çıkarılır, sonra iş yapılır, sonra sonuç damgalanır. `proposalId` yoksa iş yine koşar — ekran
 * elle de kullanılıyor ve o yol hiç değişmemeli.
 *
 * **İş düşerse satır `failed`e park eder ve hata ÇAĞIRANA fırlatılır**: ekran kendi hata cümlesini
 * gösterir, kuyruk da sessizce "uygulandı" sanmaz. Yarış kaybedilirse (`claimForApply` null) iş
 * HİÇ koşmaz — kullanıcı öneriyi başka bir sekmede uygulamışsa ikinci kaydı burada doğurmayız.
 */
export async function withProposal<T>(
  proposalId: string | null | undefined,
  staffId: string,
  work: () => Promise<T>,
  resultOf: (value: T) => ApplyResult,
): Promise<T> {
  if (!proposalId) return work();

  const service = new AssistantProposalService(serviceDb());
  const claimed = await service.claimForApply(proposalId, staffId);
  // Karar başkasında/başka sekmede verilmiş: öneriyi ikinci kez uygulamak yerine hiç uygulamıyoruz.
  if (!claimed) throw new Error('Bu öneri kuyrukta değil — başka bir sekmede karar verilmiş olabilir.');

  try {
    const value = await work();
    await service.markApplied(proposalId, resultOf(value));
    return value;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    await service.markFailed(proposalId, reason);
    void captureError(err, { source: SOURCES.webAction, context: { proposalId, phase: 'handoff' } });
    throw err;
  }
}
