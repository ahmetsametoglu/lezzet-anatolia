import { z } from 'zod';

// JobRun — zamanlanmış işin son tur izi (STACK §13 cron disiplini). İş başına TEK satır;
// tarihçe tutulmaz. `lastRunAt` iş DÜŞSE de yazılır: "koştu ama hata verdi" ile "hiç koşmadı"
// birbirine karışmasın (gecikme alarmı bu ayrımı okur).

export const JobRunSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  lastRunAt: z.string(),
  lastResult: z.record(z.unknown()).nullable(),
  lastError: z.string().nullable(),
});
export type JobRun = z.infer<typeof JobRunSchema>;

export const JobRunInsertSchema = z.object({
  name: z.string(),
  lastRunAt: z.string().optional(),
  lastResult: z.record(z.unknown()).nullish(),
  lastError: z.string().nullish(),
});
export type JobRunInsert = z.infer<typeof JobRunInsertSchema>;

export const JobRunUpdateSchema = JobRunSchema.partial().required({ id: true });
export type JobRunUpdate = z.infer<typeof JobRunUpdateSchema>;
