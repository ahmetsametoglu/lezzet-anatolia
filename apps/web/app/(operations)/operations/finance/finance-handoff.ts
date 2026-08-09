import 'server-only';
import { fromCents } from '@lezzet/helper';
import { MoneyMovementPayloadSchema } from '@lezzet/types';
import { readHandoffProposal } from '@/lib/assistant/handoff';
import { MANUAL_TYPES, type ManualMovementForm, type MoneyHandoff } from './finance-types';

/**
 * Asistan önerisi → para ekranının ön dolgusu (22.5).
 *
 * ── ÖNERİNİN DÖRT TİPİNİN ÜÇÜ BU EKRANDAN GEÇER ──────────────────────────────
 * `MoneyMovementPayload.type` dört değer taşıyor (`expense · transfer · capital · misc`), elle
 * hareket kapısı ise ÜÇÜNÜ kabul ediyor (`MANUAL_TYPES` = gider · sermaye · sınıflandırılmamış).
 *
 * **`transfer` kendi kapısından geçer** — iki hesap ister ve tek satırla iki tarafı yazar; elle
 * hareket formunda karşı hesap alanı yok. Bu tipte form ön DOLDURULMAZ: dolduramayacağı bir formu
 * doldurmuş gibi göstermek, kaydete basınca "motor reddetti" ile biterdi. Ekran bunun yerine hangi
 * yoldan gidileceğini SÖYLER.
 *
 * ── BEŞİNCİ TİP (`purchase`) ARTIK KÜMEDE YOK ────────────────────────────────
 * Bu ekran bir tur onu da karşılıyordu ("malı mal kabulden girin" künyesiyle). Bulgu denetime
 * bildirildi ve kabul edildi: motor bağsız alımı `supply_link_missing` ile reddettiği için asistan
 * **uygulanması imkânsız** bir dilekçe kurabiliyordu. Daraltma şemaya taşındı — böyle bir öneri
 * artık kuyruğa hiç yazılamıyor, yani ekranın onu karşılayan dalına da gerek kalmadı. Kuyruğun en
 * sinsi çürüme yolu buydu: reddedilmeyi bekleyen kalemler onay refleksini köreltir.
 */

export async function readMoneyHandoff(proposalId: string | null): Promise<MoneyHandoff | null> {
  if (!proposalId) return null;
  const proposal = await readHandoffProposal(proposalId);
  if (!proposal || proposal.kind !== 'money_movement') return null;

  const parsed = MoneyMovementPayloadSchema.safeParse(proposal.payload);
  if (!parsed.success) return null;
  const payload = parsed.data;

  const base = { proposalId: proposal.id, summary: proposal.summary, reason: proposal.reason };

  if (payload.type === 'transfer') {
    return {
      ...base,
      form: null,
      blocked:
        'Bu bir hesaplar arası transfer — kendi kapısından geçer ("⇄ Transfer"), çünkü iki hesap ister. Tutar ve hesaplar önerideki gibi: aşağıdaki künyeye bakıp transferi açın.',
    };
  }

  // Kalan üç tip formun kendi kümesi; `satisfies` yerine çalışma anı kontrolü, çünkü tip listesi
  // payload tarafında büyüyebilir ve o gün burası sessizce yanlış doldurmamalı.
  if (!(MANUAL_TYPES as readonly string[]).includes(payload.type)) return { ...base, form: null, blocked: null };

  return {
    ...base,
    blocked: null,
    form: {
      accountId: payload.accountId,
      type: payload.type as ManualMovementForm['type'],
      // Payload CENT taşıyor, form EURO — çevrim burada (`ManualMovementSchema` künyesi).
      amount: fromCents(payload.amountCents),
      direction: payload.direction,
      category: payload.category ?? '',
      campaign: '',
      // Değer tarihi yoksa form kendi bugününü kullanır — uydurma bir tarih defterde yanlış güne yazardı.
      valueDate: payload.valueDate ?? '',
      description: payload.description ?? '',
    },
  };
}
