import 'server-only';
import { CountryEnum, ZoneExtendPayloadSchema } from '@lezzet/types';
import { readHandoffProposal } from '@/lib/assistant/handoff';
import type { PostalCodePick } from './routes-types';

/**
 * Asistan önerisi → rota kurulumunun ön dolgusu (22.5).
 *
 * **Payload şekli BURADA doğrulanır** (`safeParse`), `as` ile kesilmez: kesilseydi bozuk bir dilekçe
 * ekranı çökertirdi. Doğrulama düşerse `null` döner ve ekran normal açılır — öneriden gelmemiş gibi.
 * Sessiz kalmak burada doğru: operatörün istediği zaten rota kurmak, öneri yalnız bir kolaylıktı.
 *
 * Dosya `server-only`: `readHandoffProposal` veritabanına gidiyor ve bu okuma sayfanın işidir.
 */
export interface ZoneHandoff {
  proposalId: string;
  /** Önerinin işaret ettiği bölge — sayfa seçimi buna göre açar. */
  zoneId: string;
  zoneName: string;
  summary: string;
  /** Asistanın gerekçesi; yazılmamış olabilir. */
  reason: string | null;
  /** Ön seçili kodlar — operatör haritada çıkarabilir/ekleyebilir. */
  codes: PostalCodePick[];
  /** Kod başına haber bekleyen müşteri sayısı; bildirimin kime gideceği kod ÇIKARILINCA değişir. */
  waitingByCode: Record<string, number>;
}

export async function readZoneHandoff(proposalId: string | null): Promise<ZoneHandoff | null> {
  if (!proposalId) return null;
  const proposal = await readHandoffProposal(proposalId);
  if (!proposal || proposal.kind !== 'zone_extend') return null;

  const parsed = ZoneExtendPayloadSchema.safeParse(proposal.payload);
  if (!parsed.success) return null;
  const payload = parsed.data;

  // Payload ülkeyi serbest iki harf olarak taşıyor (`z.string().length(2)`), rota kurulumu ise
  // KAPALI kümeyle çalışıyor (`Country`). Tanımadığımız bir ülke gelirse ön dolgu yapılmaz: kodu
  // zorla `FR` saymak, kaydedilirken yanlış ülkeye yazılmasına yol açardı.
  const country = CountryEnum.safeParse(payload.country);
  if (!country.success) return null;

  return {
    proposalId: proposal.id,
    zoneId: payload.zoneId,
    zoneName: payload.zoneName,
    summary: proposal.summary,
    reason: proposal.reason,
    codes: payload.postalCodes.map((code) => ({ country: country.data, postalCode: code.postalCode })),
    waitingByCode: Object.fromEntries(payload.postalCodes.map((code) => [code.postalCode, code.waitingCount])),
  };
}
