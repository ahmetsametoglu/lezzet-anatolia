import { z } from 'zod';

// Passwordless giriş OTP tablosu (migration 0003). Kod plain mail'e gider; DB'de yalnız
// SHA-256 hash. Servis (EmailVerificationService) atomik RPC'ler üzerinden çalışır —
// insert/update/verify DB fonksiyonlarında; Insert/Update şemaları base sözleşmesi için.

export const EmailVerificationSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  tokenHash: z.string(),
  expiresAt: z.string(),
  usedAt: z.string().nullable(),
  attempts: z.number().int(),
  createdAt: z.string(),
});
export type EmailVerification = z.infer<typeof EmailVerificationSchema>;

export const EmailVerificationInsertSchema = EmailVerificationSchema.pick({ email: true, tokenHash: true, expiresAt: true });
export type EmailVerificationInsert = z.infer<typeof EmailVerificationInsertSchema>;

// Anlamlı app-katmanı güncellemesi yok (durum değişimi RPC'de) — base sözleşmesi için placeholder.
export const EmailVerificationUpdateSchema = EmailVerificationSchema.partial().required({ id: true });
export type EmailVerificationUpdate = z.infer<typeof EmailVerificationUpdateSchema>;
