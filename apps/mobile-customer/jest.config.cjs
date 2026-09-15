// Jest — ortak taban kitte (`@lezzet/mobile-kit/jest-base.cjs`, 21.310): preset, zaman aşımı, pnpm-uyumlu
// dönüşüm kalıbı ve ORTAK kurulum native uygulamalarda tek kaynak, gerekçeleri orada. Burada yalnız bu
// uygulamanın yerel modül sahteleri eklenir: taban kurulumun SONUNA (Jest, preset setupFiles'ını
// config'le birleştirir).
const base = require('@lezzet/mobile-kit/jest-base.cjs');

module.exports = { ...base, setupFiles: [...base.setupFiles, '<rootDir>/jest.setup.ts'] };
