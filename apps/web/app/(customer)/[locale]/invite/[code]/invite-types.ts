import type { LocalizedCopy } from '@lezzet/i18n';
// `typeof messages` için değer bağı gerek (Messages tipi JSON'dan türetilir).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './messages.json';

// Davet karşılamasının tip modülü (view DEĞİL — ekranın kendisi `page.tsx`).

export type Messages = LocalizedCopy<typeof messages>;

/**
 * Ziyaretçinin daveti kabul ettiğinde gideceği yer. **Serbest bir yol DEĞİL, iki seçenek** ve bu
 * bir güvenlik kararı: hedef server action'a istemciden geliyor: açık uçlu olsaydı davet sayfası
 * dilediğiniz adrese yönlendiren bir açık yönlendirme (open redirect) kapısı olurdu.
 */
export type InviteTarget = 'catalog' | 'login';
