import { Space_Grotesk, IBM_Plex_Mono, Karla } from 'next/font/google';

// Operasyon evreni ("Veri Masası") fontları. latin-ext → Türkçe (ş ğ ı) doğru gösterilir.
const spaceGrotesk = Space_Grotesk({ subsets: ['latin', 'latin-ext'], variable: '--font-space-grotesk', display: 'swap' });
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-mono',
  display: 'swap',
});
const karla = Karla({ subsets: ['latin', 'latin-ext'], variable: '--font-karla', display: 'swap' });

/**
 * Operasyon kabuğunu kuran HER kök aynı değişkenleri taşır: uygulama, yetki ekranı ve grubun
 * dışında kalan `/oauth/error`. Layout'ta durduğu sürece o ağacın dışındaki ekran fontsuz kalırdı.
 */
export const opsFontVars = `${spaceGrotesk.variable} ${ibmPlexMono.variable} ${karla.variable}`;
