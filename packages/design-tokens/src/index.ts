// @lezzet/design-tokens — tasarım token'larının TEK KAYNAĞI (21.3).
// Bugün kaynak fiilen `apps/web/app/globals.css`; parite testi iki tarafı birebir tutar.
// Web şeridi `@theme` üretimini benimseyince yön döner: modül kaynak, CSS türev olur.
// RN tarafı (Unistyles teması) bu modülü doğrudan import eder — sınıf adı değil TOKEN
// paylaşılır (docs/uygulama/01 §11), "ham hex yasak" kuralı iki platformda da aynı kalır.
export {
  customerSurface,
  customerSand,
  customerOlive,
  customerTerracotta,
  customerHoney,
  customerClosed,
  customerInteraction,
  customerColors,
  customerText,
  customerRadius,
} from './customer';
export {
  operationsText,
  operationsSurface,
  operationsGray,
  operationsAliases,
  operationsOlive,
  operationsAmber,
  operationsRed,
  operationsAlarm,
  operationsBrand,
  operationsBlue,
  operationsSlate,
  operationsViolet,
  operationsScrim,
  operationsInteraction,
  operationsColors,
  operationsRadius,
  operationsDarkColors,
} from './operations';
export { renderThemeCss, flattenThemeTokens, flattenDarkTokens } from './render-theme-css';
