import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

// Locale-farkında navigasyon. `Link` iç yolu (ör. '/login') alır, dile göre yerelleştirir.
// `getPathname` next-intl DIŞI redirect'ler için (route handler / operations guard) yerel yolu üretir.
// `usePathname` locale ÖNEKSİZ iç yolu verir — dil değiştirici aynı sayfanın başka dildeki hâline
// gitmek için kullanır (ana sayfaya atmaz).
// `useRouter` arama kutusu içindir: form gönderimi kataloğa YÖNLENDİRİR, hedef yol dile göre
// çevrilir (`/catalog` → `/fr/catalogue`). Ham `<form action>` bunu yapamaz, yol dilden bağımsız değil.
// `redirect` sunucu bileşeni içindir: hedef yol dile göre çevrilir (`/cart` → `/fr/panier`) —
// ödeme sayfası girişsiz müşteriyi sepete böyle çevirir (13.09).
export const { Link, getPathname, redirect, usePathname, useRouter } = createNavigation(routing);
