import { setAiUsageRecorder } from '@lezzet/ai';
import { aiUsageRecorder } from '@lezzet/application/ai/usage-recorder';
import { serviceDb } from '@lezzet/database';
import { installSupabaseKeepAlive } from '@lezzet/database/keep-alive';

/*
  Yalnız Node sürecinde yüklenir (`instrumentation.ts` → `register`), çünkü içe aktardığı Node'a özgü ağaç edge derlemesine
  girerse derleme `node:` şemasında kırılır. Kancalar süreç genelinde `globalThis`te durur: Next server action ve route
  derlemelerinde modülleri ayrı grafiklerde yükler, kurulan kanca yine hepsinde görünür.
*/
setAiUsageRecorder(aiUsageRecorder(serviceDb()));
installSupabaseKeepAlive();
