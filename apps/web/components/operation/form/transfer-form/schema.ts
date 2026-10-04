import { z } from 'zod';
import { parisDateOf } from '@lezzet/helper';

/**
 * Transfer formunun şeması finans diyaloğu ile asistan kuyruğunun paylaştığı tek tanımdır; ortak alandadır, çünkü komponentin sayfa
 * klasöründen şema okuması ters yönlü bağımlılık olurdu.
 */
export const TransferFormSchema = z.object({
  fromAccountId: z.string().min(1),
  toAccountId: z.string().min(1),
  /** **EURO** — kapıya `toCents` ile gider (`ManualMovementSchema` künyesi). */
  amount: z.number().positive().nullable(),
  valueDate: z.string(),
  description: z.string(),
});
export type TransferForm = z.infer<typeof TransferFormSchema>;

/** Paris takviminde bugün, değer tarihinin varsayılanı; UTC günü gece yarısından sonra hareketi önceki güne yazardı. */
export function transferToday(): string {
  return parisDateOf(new Date());
}

/**
 * Kaydetmeyi engelleyen sebep — alt bar bunu YAZIYOR, düğmeyi sessizce kapatmıyor.
 *
 * Kurallar motorda da var (`transfer_same_account`), burada bir kez daha yazılı çünkü kural kapıda
 * öğrenilmemeli: kaydet düğmesine basıp hata okumak, seçerken uyarılmaktan kötüdür.
 */
export function transferBlock(values: TransferForm): string | null {
  if (!values.fromAccountId) return 'Paranın çıktığı hesabı seçin.';
  if (!values.toAccountId) return 'Paranın gittiği hesabı seçin.';
  if (values.fromAccountId === values.toAccountId) return 'Aynı hesabın içinde transfer olmaz — iki farklı hesap seçin.';
  if (!values.amount || values.amount <= 0) return 'Tutar sıfırdan büyük olmalı.';
  return null;
}
