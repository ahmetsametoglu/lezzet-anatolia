import 'server-only';
import { AssistantProposalService, serviceDb } from '@lezzet/database';
import { modeOf, type ApplyResult } from '@lezzet/application';
import { captureError, SOURCES } from '@lezzet/observability';
import type { AssistantProposalKind } from '@lezzet/types';

/**
 * DEVREDİLEN önerinin iki ucu (22.5 · kullanıcı kararı 09.08).
 *
 * Kuyruk ilk hâlinde tek kapılıydı — onayla ya da reddet. Gerçek kullanım bunu çürüttü: *"bölgeye
 * hangi posta kodlarının gireceğine haritaya bakmadan karar veremem"*. Geri alınamaz üç tip
 * (`zone_extend` · `stock_intake` · `money_movement`) bu yüzden kuyrukta UYGULANMAZ; ilgili
 * operasyon ekranı ÖN DOLDURULUR, düzenleme orada yapılır, kayıt oradan ve normal akışla olur.
 *
 * ── NEDEN İKİ FONKSİYON, HER EKRANDA BEŞ SATIR DEĞİL ────────────────────────
 * Üç hedef ekranın üçü de aynı şeyi yapacak: öneriyi oku → formu doldur → kaydederken kuyruğu
 * kapat. Üç yere kopyalansaydı biri bir gün `claimForApply`i atlar ve aynı öneri iki kez
 * uygulanırdı — kuyruğun TEK vaadi de o olurdu. Sıra burada, tek yerde durur.
 *
 * ── İKİNCİ YAZMA YOLU YİNE AÇILMIYOR ────────────────────────────────────────
 * Bu dosya hiçbir iş tablosuna dokunmaz. Ekranın kendi action'ı ne yapıyorsa onu yapar (mal kabul
 * `receive_intake` RPC'sini, rota `replacePostalCodes`ı çağırır); buradaki sarmalayıcı yalnız
 * kuyruk satırının hâlini yönetir. Öneriden gelen kayıt ile elle girilen kayıt AYNI yoldan doğar.
 */

/** Hedef ekranın formu doldurmak için ihtiyacı olan her şey — payload HAM gelir, şekli `kind`'a göre. */
export interface HandoffProposal {
  id: string;
  kind: AssistantProposalKind;
  summary: string;
  reason: string | null;
  payload: unknown;
  expiresAt: string;
}

/**
 * Devredilen öneriyi okur. `null` dönüşün üç sebebi olabilir ve üçü de aynı şeyi gerektirir
 * (ekran formu boş açar, uyarı göstermez): satır yok · artık `pending` değil · devredilebilir
 * bir tip değil.
 *
 * Son madde bir yetki kapısıdır: URL'e elle `?proposal=<id>` yazan biri, `apply` modundaki bir
 * öneriyi bu yoldan uygulatamaz. Mod künyeden okunur, ekranın iddiasından değil.
 */
export async function readHandoffProposal(id: string): Promise<HandoffProposal | null> {
  const row = await new AssistantProposalService(serviceDb()).getById(id);
  if (!row || row.status !== 'pending') return null;
  if (modeOf(row.kind) !== 'handoff') return null;
  return {
    id: row.id,
    kind: row.kind,
    summary: row.summary,
    reason: row.reason,
    payload: row.payload,
    expiresAt: row.expiresAt,
  };
}

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
