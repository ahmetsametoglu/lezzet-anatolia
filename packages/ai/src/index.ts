// @lezzet/ai — sağlayıcıdan bağımsız yapay zekâ portu: görev kaydı, tipli çağrı ve jeton ölçümü; veritabanı, log ve iş kuralı yok.
export type { AiFailure, AiFailureReason, AiModel, AiProviderName, AiResult, AiSuccess, AiTask, AiTier, AiUsage } from './types';
export { pickModel, resolveModel, setAiModelChoices, type AiModelChoices } from './provider';
export { runTask } from './run';
// Kaydedici ve model seçimi süreç başında uygulamadan takılır, çünkü paket veritabanını bilmez.
export { setAiUsageRecorder, type AiUsageContext, type AiUsageRecord, type AiUsageRecorder } from './usage-recorder';
export { EMPTY_USAGE, addUsage, estimateCost, toAiUsage, type ModelRate } from './usage';
export { TranslateOutputSchema, translateTask, type TranslateInput, type TranslateOutput } from './tasks/translate';
export {
  AnalyticsInsightOutputSchema,
  analyticsInsightTask,
  type AnalyticsInsightInput,
  type AnalyticsInsightOutput,
} from './tasks/analytics-insight';
export {
  SuggestLocalizedOutputSchema,
  suggestLocalizedTask,
  type SuggestLocalizedInput,
  type SuggestLocalizedOutput,
} from './tasks/suggest-localized';
export {
  ticketAgentTask,
  ticketDraftTask,
  type SupportContextInput,
  type SupportMessageInput,
} from './tasks/ticket-support';
export { bankColumnsTask, type BankColumnsInput } from './tasks/bank-columns';
export { b2bSummaryTask, type B2bSummaryInput } from './tasks/b2b-summary';
export {
  VoiceTranscriptOutputSchema,
  voiceTranscriptTask,
  type VoiceTranscriptInput,
  type VoiceTranscriptOutput,
} from './tasks/voice-transcript';

/** Araçları uygulama katmanı tanımlar ama SDK'ya bağlanmaz; ilkel buradan çıkar ki sağlayıcı katmanı değişince araç dosyaları değişmesin. */
export { tool, type ToolSet } from 'ai';

/** Şema ilkeli de buradan çıkar: araç şeması başka bir zod kopyasından gelirse SDK'nın doğrulaması tutmaz ve araç hiç çağrılmaz. */
export { z } from 'zod';
