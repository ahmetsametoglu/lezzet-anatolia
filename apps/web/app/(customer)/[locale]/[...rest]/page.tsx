import { notFound } from 'next/navigation';

/**
 * Müşteri catch-all — `[locale]` altındaki eşleşmeyen tüm yolları (ör. /tr/products) yakalar ve
 * `notFound()` çağırır. Next'te eşleşmeyen URL varsayılan olarak KÖK not-found'a düşer; segment
 * `not-found.tsx` yalnız açık `notFound()` ile tetiklenir. Bu köprü olmadan yerelleştirilmiş 404
 * (customer/[locale]/not-found.tsx) devreye girmez. Gerçek rotalar (page.tsx/login) önceliklidir.
 */
export default function CustomerCatchAll() {
  notFound();
}
