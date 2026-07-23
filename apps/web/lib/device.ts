import 'server-only';
import { headers } from 'next/headers';

export type Device = 'mobile' | 'desktop';

// Telefon UA'ları mobil; tablet/masaüstü → desktop. Sapma 3: cihaz ipucu ilk boya için
// sunucudan gelir (UA-sniffing SSR ağacını çatallamaz; yalnız client'a prop olarak iner).
const MOBILE_UA = /Mobi|Android|iPhone|iPod|IEMobile|BlackBerry|Opera Mini/i;

export async function detectDevice(): Promise<Device> {
  const ua = (await headers()).get('user-agent') ?? '';
  return MOBILE_UA.test(ua) ? 'mobile' : 'desktop';
}
