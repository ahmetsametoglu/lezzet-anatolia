import { setAiUsageRecorder } from '@lezzet/ai';
import { aiUsageRecorder } from '@lezzet/application/ai/usage-recorder';
import { serviceDb } from '@lezzet/database';

/*
  YALNIZ NODE SÜRECİNDE yüklenir (`instrumentation.ts` → `register`). Ayrı dosya, çünkü içe aktardığı ağaç
  (veritabanı istemcisi, pino) edge derlemesine girerse derleme `node:` şemasında kırılır — yaşandı (30.07,
  `instrumentation.ts` künyesi).

  Kanca süreç genelinde tektir (`globalThis` — `@lezzet/ai/usage-recorder` künyesi): Next'in server action
  ve route derlemeleri bu modülü ayrı grafiklerde yükler, kaydedici yine hepsinde görünür.
*/
setAiUsageRecorder(aiUsageRecorder(serviceDb()));
