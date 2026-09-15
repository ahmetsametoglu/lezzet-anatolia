import path from 'node:path';

import { describeAppConfigGuard } from '@lezzet/mobile-kit/src/testing/guards/app-config';

// `app.config.ts`in Node ESM bekçisi — kural ve gerekçesi kitte (`testing/guards/app-config.ts`).
// Uygulama kökü bu dosyanın iki üstü (`src/lib` → paket kökü).
describeAppConfigGuard(path.resolve(__dirname, '..', '..'));
