import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

// Locale-farkında navigasyon. `Link` iç yolu (ör. '/login') alır, dile göre yerelleştirir.
// `getPathname` next-intl DIŞI redirect'ler için (route handler / operations guard) yerel yolu üretir.
export const { Link, getPathname } = createNavigation(routing);
