'use server';

import { unregisterPushDevice } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import { currentCustomerId } from '@/lib/guard';
import { forgetWebPushEndpoint, readWebPushEndpoint } from '@/lib/push/web-push-cookie';
import { createClient } from '@/lib/supabase/server';

/**
 * Guard yok, çünkü çıkış herkese açıktır ve oturumsuz için zararsızdır. Çağıran çıkıştan sonra sayfayı tam yeniler: oturuma göre
 * kurulmuş her istemci durumu sıfırdan kurulmalı, yoksa paylaşılan cihazda önceki kişinin verisi ekranda kalır.
 */
export async function signOutAction(): Promise<void> {
  // Tarayıcı aboneliği oturum kapanmadan silinir, yoksa çıkış yapılmış tarayıcıya önceki müşterinin sipariş haberi düşerdi.
  const endpoint = await readWebPushEndpoint();
  const customerId = endpoint ? await currentCustomerId() : null;
  if (endpoint && customerId) await unregisterPushDevice(serviceDb(), { profileId: customerId, token: endpoint });
  await forgetWebPushEndpoint();

  const supabase = await createClient();
  // Yalnız bu tarayıcıdan çıkılır, native'in çıkışı gibi: varsayılan `global` müşterinin uygulamadaki oturumunu da kapatır.
  await supabase.auth.signOut({ scope: 'local' });
}
