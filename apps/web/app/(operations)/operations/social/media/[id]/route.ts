import { NextResponse } from 'next/server';
import { MessageService, serviceDb } from '@lezzet/database';
import { privateReadUrl } from '@lezzet/storage';
import { requireAdmin } from '@/lib/guard';

/**
 * Balon imzalı adresi değil bu geçidi taşır: imzalı adres dakikalarda ölür ve açık kalan sekmede görsel kırılırdı; süreyi
 * uzatmak ise kopyalanan adresi de yaşatırdı. Akış değil yönlendirme: baytlar doğrudan R2'den iner, sunucumuzdan iki kez geçmez.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  // Yetki her istekte: geçit bir bağlantı değil, bir kapıdır.
  await requireAdmin();

  const { id } = await ctx.params;
  const message = await new MessageService(serviceDb()).getById(id);

  // Mesaj yok, medyası yok, kova ayarsız: üçü de 404; ayırt eden cevap var olmayan bir kimliği doğrulardı.
  const url = await privateReadUrl(message?.mediaKey ?? null, 300);
  if (!url) return new NextResponse('bulunamadı', { status: 404 });

  // Önbelleğe alınmaz: hedef süreli bir adres ve tarayıcı sonraki açılışta ölü adresi yeniden kullanırdı.
  return NextResponse.redirect(url, { status: 307, headers: { 'cache-control': 'no-store' } });
}
