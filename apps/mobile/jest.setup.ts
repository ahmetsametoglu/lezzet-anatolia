// UYGULAMANIN JEST KURULUMU — ortak kurulum (Unistyles + tema, hareket, çekmece, dokunma ertelemesi)
// kitte ve ÖNCE o koşar (`@lezzet/mobile-kit/jest-base.cjs` → `setupFiles`, 21.310). Burada yalnız bu
// uygulamanın yerel modül sahteleri.

/* `require` fabrikada ZORUNLU — gerekçesi kitin `jest.setup.ts` künyesinde (`jest.mock` hoisting). */
/* eslint-disable @typescript-eslint/no-require-imports */
/* ÖDEME SDK'sı (09.08) — kök `_layout` `PaymentProvider` ile sarmalandığı an her ekran testi yerel
   Stripe modülüne çarpıyor ("TurboModuleRegistry … 'StripeSdk' could not be found", ölçüldü: 18
   paket birden düştü).

   DOĞRU DOSYA `jest/mock.js`, `jest/setup.js` DEĞİL: setup yalnız Onramp modülünü sahteliyor,
   `StripeSdk`'ya hiç dokunmuyor — `setupFiles`a eklemek denendi ve çözmedi. Paketin kendi mock'u;
   elle taklit yazılmadı. */
jest.mock('@stripe/stripe-react-native', () => require('@stripe/stripe-react-native/jest/mock.js'));
/* GÖRSEL SEÇİCİ (21.309) — talep fotoğrafı; paketin kendi mock'u yok, gerekçe ve sahtenin şekli
   `testing/expo-image-picker.mock.ts` künyesinde. */
jest.mock('expo-image-picker', () => require('@/testing/expo-image-picker.mock'));
/* eslint-enable @typescript-eslint/no-require-imports */
