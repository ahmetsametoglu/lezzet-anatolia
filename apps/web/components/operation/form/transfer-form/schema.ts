import { z } from 'zod';

/**
 * **TRANSFER FORMUNUN ŞEMASI** — iki yüzeyin paylaştığı tek tanım (22.22).
 *
 * Finans ekranının `finance-types.ts` dosyasındaydı; asistan kuyruğu da aynı formu açtığı için
 * ortak alana çıktı. Bir komponentin sayfa klasöründen şema okuması ters yönlü bağımlılıktır ve
 * `docs:check §3e` bunu zaten yasaklıyor.
 *
 * **Yeniden ihraç YOK:** iki çağıran da (finans diyaloğu · kuyruk gövdesi) şemayı buradan okuyor.
 * Eski adresten de vermek, aynı tanıma ikinci bir kapı açmak olurdu.
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

/** Bugün (YYYY-AA-GG) — değer tarihinin varsayılanı; uydurma bir tarih defterde yanlış güne yazar. */
export function transferToday(): string {
  return new Date().toISOString().slice(0, 10);
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
