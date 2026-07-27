import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

// Locale-farkında navigasyon. `Link` iç yolu (ör. '/login') alır, dile göre yerelleştirir.
// `getPathname` next-intl DIŞI redirect'ler için (route handler / operations guard) yerel yolu üretir.
// `usePathname` locale ÖNEKSİZ iç yolu verir — dil değiştirici aynı sayfanın başka dildeki hâline
// gitmek için kullanır (ana sayfaya atmaz).
export const { Link, getPathname, usePathname } = createNavigation(routing);
