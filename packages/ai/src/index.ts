// @lezzet/ai — sağlayıcı-agnostik AI PORTU. Görev kaydı + tipli çağrı + token ölçümü; başka
// hiçbir şey (ne DB, ne log, ne iş kuralı). Kullanım amaçları ve prompt kararları:
// docs/build/20-yapay-zeka.md
export type { AiFailure, AiFailureReason, AiModel, AiProviderName, AiResult, AiSuccess, AiTask, AiTier, AiUsage } from './types';
export { DEFAULT_PROVIDER, resolveModel } from './provider';
export { runTask } from './run';
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
