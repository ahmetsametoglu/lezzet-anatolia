// Jest — ortak taban kitte (`@lezzet/mobile-kit/jest-base.cjs`, 21.310): preset, zaman aşımı ve
// pnpm-uyumlu dönüşüm kalıbı native uygulamalarda tek kaynak, gerekçeleri orada. Burada yalnız bu
// uygulamanın kök kurulumu: setupFiles preset'inkilerin SONUNA eklenir (Jest, preset setupFiles'ını
// config'le birleştirir).
module.exports = { ...require('@lezzet/mobile-kit/jest-base.cjs'), setupFiles: ['<rootDir>/jest.setup.ts'] };
