// `cwd` `current` bağından geçer: yeniden yüklenen süreç yeni sürüm klasöründe açılır.
// Port ve derleme klasörü burada verilir: env dosyasındaki boş satır `??` yedeğini atlatır, ortamda
// tanımlı değeri ise dosya ezmez.
const CURRENT = `${process.env.APP_DIR || '/opt/lezzet'}/current`;

module.exports = {
  apps: [
    {
      name: 'web',
      cwd: `${CURRENT}/apps/web`,
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      env: { NODE_ENV: 'production', NEXT_DIST_DIR: '.next' },
      max_memory_restart: '1G',
    },
    {
      name: 'backend',
      cwd: `${CURRENT}/apps/backend`,
      script: 'node_modules/.bin/tsx',
      args: 'src/index.ts',
      interpreter: 'none',
      env: { NODE_ENV: 'production', BACKEND_PORT: '8787' },
      max_memory_restart: '768M',
    },
    {
      name: 'mobile-api',
      cwd: `${CURRENT}/apps/mobile-api`,
      script: 'node_modules/.bin/tsx',
      args: 'src/index.ts',
      interpreter: 'none',
      env: { NODE_ENV: 'production', MOBILE_API_PORT: '3002' },
      max_memory_restart: '512M',
    },
  ],
};
