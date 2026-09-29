'use server';

import { createClient } from '@/lib/supabase/server';

/**
 * Guard yok, çünkü çıkış herkese açıktır ve oturumsuz için zararsızdır. Çağıran çıkıştan sonra sayfayı tam yeniler: oturuma göre
 * kurulmuş her istemci durumu sıfırdan kurulmalı, yoksa paylaşılan cihazda önceki kişinin verisi ekranda kalır.
 */
export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
