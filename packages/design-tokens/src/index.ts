// @lezzet/design-tokens — tasarım token'larının TEK KAYNAĞI (21.3).
// Bugün kaynak fiilen `apps/web/app/globals.css`; parite testi iki tarafı birebir tutar.
// Web şeridi `@theme` üretimini benimseyince yön döner: modül kaynak, CSS türev olur.
// RN tarafı (Unistyles teması) bu modülü doğrudan import eder — sınıf adı değil TOKEN
// paylaşılır (docs/uygulama/01 §11), "ham hex yasak" kuralı iki platformda da aynı kalır.
//
// İKİ AİLE, İKİ DOSYA (kullanıcı kararı 07.08): `customer*` CSS ikizidir (web + ortak taban),
// `customerApp*` mobil uygulamanın kendi token'larıdır. Uygulama teması ikisini KOMPOZİSYONLA
// birleştirir ve aynı addaki anahtarda uygulama kazanır:
//     { ...customerColors, ...customerAppColors }   ·   { ...customerRadius, ...customerAppRadius }
// Web tarafı `customerApp*` ihraçlarını hiç görmez — ayrım sonekle değil DOSYAYLA kuruludur.
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
  customerAppOverrides,
  customerAppSand,
  customerAppError,
  customerAppScrim,
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
