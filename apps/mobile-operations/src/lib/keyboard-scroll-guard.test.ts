import path from 'node:path';

import { describeKeyboardScrollGuard } from '@lezzet/mobile-kit/src/testing/guards/keyboard-scroll';

// Klavye koruması bekçisi — kural ve gerekçesi kitte (`testing/guards/keyboard-scroll.ts`). Burada bu
// uygulamanın kaynağı (`src/`) taranır; kitin kaynağı ve kapları kitin kendi testinde.
describeKeyboardScrollGuard(path.resolve(__dirname, '..'));
