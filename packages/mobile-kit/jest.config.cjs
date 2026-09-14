// Kitin kendi testleri: ortak taban (`jest-base.cjs`) + kitin kök kurulumu.
// setupFiles preset'inkilerin SONUNA eklenir (Jest, preset setupFiles'ını config'le birleştirir).
module.exports = { ...require('./jest-base.cjs'), setupFiles: ['<rootDir>/jest.setup.ts'] };
