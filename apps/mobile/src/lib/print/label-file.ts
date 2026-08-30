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

/**
 * **Taşıyıcının etiketi** (07.12) — kutu etiketinin ikizi değil, kardeşi.
 *
 * Fark kaynakta: kutu etiketini SUNUCU üretiyor ve binary akıtıyor; kargo etiketi duyuruda satın
 * alınmış bir PDF ve özel kovada duruyor. Uç bize imzalı bir adres veriyor, dosyayı buradan
 * indiriyoruz — sunucudan akıtmak her basımda VPS'i aradaki boru yapardı.
 *
 * İki tur: önce zarflı uç (yetki + hangi hâlde olduğu), sonra imzalı adres (yetkisiz, süreli).
 * `Authorization` başlığı ikinciye GÖNDERİLMEZ — imza zaten yetkinin kendisidir ve token'ı
 * kovaya taşımak onu gereksiz bir yere yaymak olurdu.
 */
export async function downloadShippingLabelPdf(boxId: string): Promise<string> {
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('oturum yok');

  const meta = await fetch(`${env.apiUrl}/api/v1/warehouse/boxes/${boxId}/shipping-label`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!meta.ok) throw new Error(`kargo etiketi sorulamadı (${meta.status})`);

  const zarf = (await meta.json()) as { data?: { status: string; url?: string } | null };
  const durum = zarf.data?.status;
  // Hâlin ADI cümleye taşınıyor: "duyurulmadı" ile "dosya saklanamadı" ayrı çareler ister.
  if (durum !== 'ok' || !zarf.data?.url) throw new Error(`kargo etiketi yok (${durum ?? 'bilinmiyor'})`);

  const file = new File(Paths.cache, `shipping-label-${boxId}.pdf`);
  const pdf = await fetch(zarf.data.url);
  if (!pdf.ok) throw new Error(`kargo etiketi indirilemedi (${pdf.status})`);
  file.write(new Uint8Array(await pdf.arrayBuffer()));
  return file.uri;
}

/**
 * **Örnek etiket** (v3:09 "test bas") — kutu etiketiyle AYNI şablon, sahte içerikle.
 *
 * `downloadLabelPng`in ikizi değil kardeşi ve fark kaynakta: o gerçek bir kutunun etiketini
 * indiriyor (ve basımı bir OLAYDIR — `markBoxPrinted` damgası düşer), bu ise hiçbir kayda
 * dokunmayan bir örneği. Gerçek bir kutunun etiketini "test" diye bastırmak, o kutunun basım
 * damgasını yalan yere düşürürdü.
 *
 * Yazıcı kimliği YOLDA çünkü uç onu bu deponun açık envanterine karşı sınıyor — görsel yazıcıya
 * göre değişmiyor, kapı değişiyor.
 *
 * Hata FIRLATIR (kardeşiyle aynı sözleşme): basım akışının tek `catch`i çağırandadır.
 */
export async function downloadSampleLabelPng(printerId: string): Promise<string> {
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('oturum yok');

  const response = await fetch(`${env.apiUrl}/api/v1/warehouse/printers/${printerId}/sample-label.png`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`örnek etiket alınamadı (${response.status})`);

  const file = new File(Paths.cache, `sample-label-${printerId}.png`);
  file.write(new Uint8Array(await response.arrayBuffer()));
  return file.uri;
}
