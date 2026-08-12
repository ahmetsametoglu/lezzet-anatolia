import type { LocalizedCopy } from '@lezzet/i18n';
// `typeof messages` için değer bağı gerek (Messages tipi JSON'dan türetilir).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './messages.json';

// Komşu daveti karşılamasının tip modülü (view DEĞİL — ekranın kendisi `page.tsx`).

export type Messages = LocalizedCopy<typeof messages>;

/**
 * Daveti kabul eden ziyaretçinin gideceği yer. **Serbest bir yol DEĞİL, iki seçenek** ve bu bir
 * güvenlik kararı: hedef server action'a istemciden geliyor; açık uçlu olsaydı sayfa dilediğiniz
 * adrese yönlendiren bir açık yönlendirme (open redirect) kapısı olurdu.
 *
 * Getiren davetinin hedeflerinden farkı `cart`: komşu daveti bir SEFERE çağırıyor, yani ziyaretçiyi
 * doğrudan sipariş yoluna koymak akışın kendisi. "Önce katalog" ikinci seçenek olarak duruyor.
 */
export type NeighborTarget = 'catalog' | 'cart';
