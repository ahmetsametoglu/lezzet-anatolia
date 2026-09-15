import { join } from 'node:path';

import { describeKitDependencyGuard } from '@lezzet/mobile-kit/src/testing/dependency-guard';

// Ortak çekirdeğin bağımlılıkları bu uygulamanın kopyalarına mı bağlı — gerekçe bekçinin künyesinde.
// Uygulama kökü bu dosyanın iki üstü (`src/lib` → paket kökü).
describeKitDependencyGuard(join(__dirname, '..', '..'));
