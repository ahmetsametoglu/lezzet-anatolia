import { NextResponse } from 'next/server';
import { MessageService, serviceDb } from '@lezzet/database';
import { privateReadUrl } from '@lezzet/storage';
import { requireAdmin } from '@/lib/guard';

/**
 * **Sohbet medyasının yetkili geçidi** (15.25) — `/operations/social/media/<mesaj-id>`.
 *
 * ── ÇÖZÜLEN ARIZA: ADRES SEKMEDE ÖLÜYORDU ───────────────────────────────────
 * İlk turda balon doğrudan imzalı R2 adresini taşıyordu ve o adres 15 dakikada ölüyor. Ekran
 * SUNUCUDA çiziliyor, yani adres sayfa yüklendiği an imzalanıyordu: operatör sekmeyi açık
 * bıraktığında fotoğraf kırık kareye, ses `0:00 / 0:00`a dönüyordu (ölçüldü 07.09 — canlı turda
 * ikisi de görünmedi). Ölçüm sebebi kesinleştirdi: Origin ile istek **200**, süresi geçmiş adres
 * **403**; yani ne CORS ne kova — yalnız süre.
 *
 * Geçit bunu yapısal olarak bitiriyor: tarayıcı her seferinde BİZE geliyor, adres burada taze
 * imzalanıyor. `<img>`in `src`i artık hiç bayatlamaz.
 *
 * ── SÜREYİ UZATMAK ÇÖZÜM DEĞİLDİ ────────────────────────────────────────────
 * TTL'i sekiz saate çekmek kırılmayı geciktirirdi ama kopyalanan bir adresi de sekiz saat
 * yaşatırdı — private kovanın tek koruması o adresin kısa ömrü. Geçitte yetki HER İSTEKTE
 * kontrol ediliyor (`requireAdmin`), yani bağlantı paylaşılsa bile giriş yapmamış biri açamaz.
 * Kısa ömür de korunuyor: aşağıdaki imza yalnız bu yönlendirme için üretiliyor.
 *
 * ── NEDEN YÖNLENDİRME, NEDEN AKIŞ DEĞİL ─────────────────────────────────────
 * Dosyayı kendi sunucumuzdan geçirmek (proxy) 900 KB'lık bir fotoğrafı iki kez taşımak olurdu:
 * R2'den bize, bizden tarayıcıya. Yönlendirmede baytlar doğrudan R2'den iniyor; biz yalnız
 * "kimsin ve bu senin sohbetin mi" sorusunu cevaplıyoruz.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  // Yetki HER istekte: geçit bir bağlantı değil, bir kapıdır.
  await requireAdmin();

  const { id } = await ctx.params;
  const message = await new MessageService(serviceDb()).getById(id);

  /*
    Mesaj yok · medyası yok · kova ayarlı değil — üçü de 404. Ayırt eden bir cevap, var olmayan bir
    kimliği "bu mesajda medya yok" diye doğrulardı; operatörün yapabileceği bir şey de yok.
  */
  const url = await privateReadUrl(message?.mediaKey ?? null, 300);
  if (!url) return new NextResponse('bulunamadı', { status: 404 });

  // Önbelleğe ALINMAZ: yönlendirmenin hedefi süreli bir adres ve önbelleğe girerse tarayıcı bir
  // sonraki açılışta ölü adresi yeniden kullanırdı — düzeltmeye çalıştığımız arızanın ta kendisi.
  return NextResponse.redirect(url, { status: 307, headers: { 'cache-control': 'no-store' } });
}
