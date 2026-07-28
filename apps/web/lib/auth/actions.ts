'use server';

import { createClient } from '@/lib/supabase/server';

/**
 * Oturumu kapatır (desen: `~/dev/petitcigogne` → `logoutCheckout`).
 *
 * **Neden var.** Uygulamada hiçbir çıkış yolu yoktu. Checkout'taki "siz değil misiniz?" bağlantısı
 * yalnız giriş sayfasına götürüyordu ve eski oturum AYAKTA kalıyordu — paylaşılan bir cihazda
 * (aile bilgisayarı, dükkândaki tablet) ikinci kişi, birincinin hesabıyla sipariş verebilirdi.
 * Referans projenin aynı yerdeki notu birebir bu senaryoyu anlatıyor.
 *
 * Guard YOK ve olmamalı: çıkış herkese açıktır, oturumu olmayan için de zararsızdır.
 *
 * Çağıran taraf çıkıştan sonra **sayfayı tam yeniler** (`router.refresh()` değil): oturum sunucuda
 * çözülüyor ve istemcide o oturuma göre kurulmuş her durum (sepet, adres seçimi, adım) sıfırdan
 * kurulmalı. Yumuşak tazeleme, ekranda önceki kişinin adresini bırakabilirdi.
 */
export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
