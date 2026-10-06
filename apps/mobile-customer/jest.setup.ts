// Ortak kurulum kitte önce koşar (`@lezzet/mobile-kit/jest-base.cjs`); burada yalnız bu uygulamanın yerel modül sahteleri.

/* `jest.mock` fabrikası yukarı taşındığı için içe aktarma değil `require` ister. */
/* eslint-disable @typescript-eslint/no-require-imports */
/* Ödeme SDK'sı yüklenirken yerel modülünü ister ve Jest'te yerel modül yoktur; paketin kendi sahtesi olmadığı için form vazgeçilmiş döner. */
jest.mock('@revolut/revolut-merchant-card-form', () => ({
  RevolutPaymentsSDK: { configure: async () => true },
  RevolutMerchantCardFormKit: { pay: async () => ({ status: 'userAbandoned' }) },
}));
/* Görsel seçicinin kendi sahtesi yok; sahtenin şekli kendi dosyasında. */
jest.mock('expo-image-picker', () => require('@/testing/expo-image-picker.mock'));
/* eslint-enable @typescript-eslint/no-require-imports */
