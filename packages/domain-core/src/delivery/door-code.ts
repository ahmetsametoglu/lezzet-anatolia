import type { Channel, DeliveryType, DoorCodeVia } from '@lezzet/types';

/**
 * Kapı kodu: kendi aracımızla teslimde müşteriye giden altı haneli kod, kurye kapıda sorar. Kod teslimi durdurmaz; kurye kodu alamazsa
 * kodsuz teslim eder ve kayıt öyle düşer, çünkü kodu olmayan müşteriyi kapıda bırakmak teslimi kanıtlamaktan pahalıdır.
 */

/** Kanal bayrakları ayardan gelir (`delivery_code_channels`). */
export type DoorCodeScope = Partial<Record<Channel, boolean>>;

/** Bu siparişe kod üretilir mi: yalnız rota teslimi, çünkü kargoyu taşıyıcı, gel-ali depocu teslim eder. */
export function doorCodeApplies(order: { channel: Channel; deliveryType: DeliveryType }, scope: DoorCodeScope): boolean {
  return order.deliveryType === 'route' && scope[order.channel] === true;
}

/** Kodu taşıyacak kanal: doğrulanmış WhatsApp numarası varsa WhatsApp, yoksa e-posta; ikisi de yoksa kod gönderilemez. */
export function doorCodeVia(reach: { whatsapp: boolean; email: boolean }): DoorCodeVia | null {
  if (reach.whatsapp) return 'whatsapp';
  return reach.email ? 'email' : null;
}

export type DoorCodeCheck =
  /** Bu siparişe kod üretilmedi. */
  | { kind: 'none' }
  | { kind: 'verified' }
  /** Kurye kodsuz teslim etti. */
  | { kind: 'skipped' }
  | { kind: 'mismatch'; attemptsLeft: number }
  | { kind: 'locked' };

/** Haklar doldu mu; kurye ekranı kilitli kodu sormaz, kodsuz teslime yönlendirir. */
export function doorCodeLocked(input: { failedAttempts: number; maxAttempts: number }): boolean {
  return input.failedAttempts >= input.maxAttempts;
}

/** Kapıda girilen kodun kararı; hak dolunca doğru kod da kabul edilmez, yoksa deneme sınırı tahmini durdurmazdı. */
export function checkDoorCode(input: {
  issued: string | null;
  given: string | null;
  failedAttempts: number;
  maxAttempts: number;
}): DoorCodeCheck {
  if (input.issued === null) return { kind: 'none' };
  if (input.given === null) return { kind: 'skipped' };
  if (doorCodeLocked(input)) return { kind: 'locked' };
  if (input.given.trim() === input.issued) return { kind: 'verified' };
  return { kind: 'mismatch', attemptsLeft: Math.max(0, input.maxAttempts - input.failedAttempts - 1) };
}
