import type { LocalizedCopy } from '@lezzet/i18n';
// `typeof messages` için değer bağı gerek (Messages tipi JSON'dan türetilir).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './messages.json';

// Değerlendirme akışının tip modülü (view DEĞİL — gerçek view `feedback-client`).

export type Messages = LocalizedCopy<typeof messages>;

/**
 * Akışın adımı — ekranın hangi yüzü çizildiğini söyleyen TEK durum.
 *
 * Ayrı ayrı `showWelcome`/`showDone` bayrakları yerine tek bir birleşim, çünkü bunlar birbirini
 * dışlıyor: ikisi birden açık olamaz ve iki bayrak tam da bunu mümkün kılardı.
 *
 * `cards` adımında hangi kartta olunduğu ayrı bir sayaçta durur — adımın kendisi değil, içindeki
 * konum. `done` adımı motorun döndürdüğü sonucu taşır (memnun / değil), çünkü o karar istemcide
 * verilmiyor.
 */
export type FeedbackStep = 'welcome' | 'cards' | 'done';
