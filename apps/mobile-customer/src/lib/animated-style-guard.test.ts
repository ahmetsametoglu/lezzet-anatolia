import path from 'node:path';

import { describeAnimatedStyleGuard } from '@lezzet/mobile-kit/src/testing/guards/animated-style';

// RN `Animated` düzleştirme bekçisi — kural ve gerekçesi kitte (`testing/guards/animated-style.ts`).
// Burada bu uygulamanın kaynağı (`src/`) taranır; kitin kaynağı kitin kendi testinde.
describeAnimatedStyleGuard(path.resolve(__dirname, '..'));
