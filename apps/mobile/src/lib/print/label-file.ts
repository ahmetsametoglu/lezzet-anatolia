import { File, Paths } from 'expo-file-system';

import { env } from '../env';
import { getSupabase } from '../auth/supabase';

/**
 * Etiket PNG'sinin indiricisi (23.7) — `GET /warehouse/boxes/:id/label.png` BINARY döner (zarf
 * yok) ve Brother SDK yalnız yerel `file://` bastığı için (23.5 ölçümü) gövde cihaz dosyasına
 * yazılır. `authorizedFetch`in ikizi DEĞİL, binary kardeşi: zarf/şema katmanı yok, 401 tazeleme
 * turu da yok — çağrı daima taze bir `sealOrderBox` cevabının hemen ardından geliyor (token o
 * uçtan yeni geçti); tazeleme mantığını buraya kopyalamak duplikasyon olurdu (CLAUDE §1).
 *
 * Hata FIRLATIR — basım akışının tek `catch`i var (hook) ve cümle ekranda gösterilir.
 */
export async function downloadLabelPng(boxId: string): Promise<string> {
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('oturum yok');

  const response = await fetch(`${env.apiUrl}/api/v1/warehouse/boxes/${boxId}/label.png`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`etiket görseli alınamadı (${response.status})`);

  const file = new File(Paths.cache, `box-label-${boxId}.png`);
  file.write(new Uint8Array(await response.arrayBuffer()));
  return file.uri;
}
