// Jest — ortak taban kitte (`@lezzet/mobile-kit/jest-base.cjs`, 21.310): preset, zaman aşımı, dönüşüm kalıbı ve
// ORTAK kurulum tek kaynaktan. Burada yalnız bu uygulamanın yerel modül sahteleri taban kurulumun SONUNA eklenir.
const base = require('@lezzet/mobile-kit/jest-base.cjs');

module.exports = { ...base, setupFiles: [...base.setupFiles, '<rootDir>/jest.setup.ts'] };
