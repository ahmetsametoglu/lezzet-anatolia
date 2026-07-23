import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

// Locale-farkında navigasyon. Şimdilik yalnız Link kullanılıyor; ihtiyaç doğunca
// redirect/usePathname/useRouter/getPathname eklenir (ölü kod yok — knip).
export const { Link } = createNavigation(routing);
