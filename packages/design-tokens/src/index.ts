// @lezzet/design-tokens: tasarım token'larının tek kaynağı; `globals.css` ile parite testi iki tarafı birebir tutar. `customer*` web
// ve ortak tabandır, `customerApp*` yalnız mobil uygulamanın token'larıdır ve uygulama teması ikisini birleştirir.
export {
  customerSurface,
  customerSand,
  customerOlive,
  customerTerracotta,
  customerHoney,
  customerClosed,
  customerError,
  customerInteraction,
  customerScrim,
  customerBrand,
  customerColors,
  customerText,
  customerPhoneTextStepPx,
  customerTabBarHomeIndicatorTrimPx,
  customerRadius,
  customerMotion,
  customerShadow,
} from './customer';
export {
  customerAppOverrides,
  customerAppError,
  customerAppCreamGlass,
  customerAppAccent,
  customerAppBrand,
  customerAppColors,
  customerAppText,
  customerAppRadius,
  customerAppShadow,
  customerAppShadowOffset,
  customerAppBlur,
  customerAppGradient,
} from './customer-app';
// OPERASYON MOBİL (21.9): müşteri tabanının ÜÇÜNCÜ katmanı — `operations.ts`in "Veri Masası"
// setiyle akrabalığı yalnız addadır. Operasyon mobil teması üç katmanı yayar:
//     { ...customerColors, ...customerAppColors, ...operationsAppColors }
// Gerekçe ve ölçüm `operations-app.ts` başlığında; web bu ihraçları da hiç görmez.
export {
  operationsAppOverrides,
  operationsAppSurface,
  operationsAppInk,
  operationsAppLine,
  operationsAppColors,
  operationsAppText,
  operationsAppRadius,
  operationsAppShadow,
  operationsAppGradient,
} from './operations-app';
export {
  operationsText,
  operationsSurface,
  operationsGray,
  operationsAliases,
  operationsOlive,
  operationsAmber,
  operationsRed,
  operationsAlarm,
  operationsBand,
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
export { FONT_SCALES, FONT_SCALE_FACTOR, FONT_SCALE_VAR, type FontScale } from './font-scale';
