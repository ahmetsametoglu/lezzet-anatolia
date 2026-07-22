import type { NextConfig } from 'next';

const config: NextConfig = {
  // Paketler kaynak olarak dışa verildiği için Next transpile eder (ara derleme yok).
  transpilePackages: [
    '@lezzet/brand',
    '@lezzet/i18n',
    '@lezzet/types',
    '@lezzet/helper',
    '@lezzet/domain-core',
    '@lezzet/database',
    '@lezzet/storage',
    '@lezzet/email',
    '@lezzet/notify',
    '@lezzet/ai',
  ],
};

export default config;
