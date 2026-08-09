import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type { StorefrontHome } from '@/lib/storefront/storefront-types';
// `typeof messages` için değer bağı gerek (Messages tipi JSON'dan türetilir) — bu yüzden `import type` değil.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './messages.json';

// Anasayfa tip/sözleşme modülü (view DEĞİL — gerçek view'lar home.desktop/home.mobile).

/** Arayüz metinleri messages.json'dan TÜRETİLİR (elle interface yok). */
export type Messages = LocalizedCopy<typeof messages>;

/**
 * Masaüstü ve mobil sunum varyantlarının paylaştığı sözleşme. Anasayfa durumsuzdur: veri sunucuda
 * çözülür, varyantlar yalnız DÜZENİ değiştirir (Sapma 3 — çatallanma client sınırında).
 */
export interface HomeViewProps {
  t: Messages;
  locale: Locale;
  data: StorefrontHome;
}

/** "En fazla {n} adet" şablonunu doldurur — sayı yerleşimi tek yerde, iki varyantta tekrarlanmaz. */
export function limitText(template: string, limit: string | null): string | null {
  return limit ? template.replace('{n}', limit) : null;
}

/**
 * **Kahraman görseli — GEÇİCİ ve statik** (09.08, kullanıcı isteği).
 *
 * İki cihaz dalı da aynı dosyayı çiziyor; sabit BURADA çünkü iki varyantta ayrı yazılsaydı biri
 * gün gelip ötekinden ayrışırdı ve ana sayfa telefonla masaüstünde başka bir fotoğraf gösterirdi.
 *
 * **Kalıcı yolu HENÜZ YOK ve bu bilinçli bir bekleyiş** (`design/BACKLOG §4`): ana sayfa hero'su
 * operatörün "Vitrin görselleri" sekmesinden yöneteceği bir SAYFA görselidir — bir ürüne ya da
 * kategoriye bağlı değil, bir sayfa YERİNE bağlı. Ürün görselinin yolu (`product-image.service`,
 * R2 + odak/kırpım künyesi) burada kullanılamaz; arka uçta `site_image` tablosu ve kovası
 * açılmadan gerçek akış kurulamıyor. O gün geldiğinde bu sabit kapıdan gelen künyeyle değişir ve
 * `public/hero-sofra.jpg` silinir.
 *
 * Dosya Unsplash lisanslı (ticari kullanıma açık, atıf gerekmez) ve 1920×1080 — tasarımın istediği
 * 16:9 çerçeveye kırpımsız oturuyor (`Musteri - Anasayfa.dc.html`: *"Sofra fotoğrafı — buğusu
 * üstünde börek / dolu bir aile sofrası"*).
 */
export const HERO_IMAGE = '/hero-sofra.jpg';
