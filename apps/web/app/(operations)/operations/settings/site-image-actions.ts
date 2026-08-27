'use server';

import { revalidatePath } from 'next/cache';
import { SiteImageService, serviceDb } from '@lezzet/database';
import { getR2, r2Keys } from '@lezzet/storage';
import { SiteImageSlotSchema, type ImageCrop, type LocalizedText, type SiteImageSlot } from '@lezzet/types';
import { requireAdmin } from '@/lib/guard';
import { readImageUpload } from '@/lib/media/upload';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { SETTINGS_PATH } from './settings-url';

/**
 * Vitrin görselleri sekmesinin yazma yolu (09.16 · `site_image`).
 *
 * **Guard `requireAdmin`** — ekranın kendi kapısıyla aynı (`settings/page.tsx`). Bu görseller
 * müşterinin ilk gördüğü şey; depo ya da kurye rolünün eli olmamalı.
 *
 * ── SLOT KAPALI KÜMEDEN, İSTEMCİNİN İDDİASINDAN DEĞİL ───────────────────────
 * Her kapı slotu şemayla doğruluyor (`SiteImageSlotSchema.parse`). Küme zaten enum ve veritabanı da
 * reddederdi; ama reddin sunucuda ve okunur bir cümleyle olması gerekiyor — istemciden gelen
 * uydurma bir slot, Postgres'in İngilizce kısıt hatasıyla dönmemeli.
 *
 * ── DOSYA HAM SAKLANIR, KIRPMA GÖRÜNTÜLEME ANINDA ───────────────────────────
 * Kardeş akışların (ürün · kategori · paket) aynısı: R2'ye yüklenen dosyaya dokunulmaz, odak ve
 * zoom künyede durur ve CSS'te uygulanır. Aynı fotoğrafın iki oranda farklı oturması bu yüzden
 * mümkün — dosyayı kırpsaydık ikinci çerçeve için ikinci dosya gerekirdi.
 */

/** Slot adresi ADRESTEN gelmiyor, gövdeden — yine de kapalı kümeye daraltılır. */
function slotOf(value: string): SiteImageSlot {
  return SiteImageSlotSchema.parse(value);
}

/**
 * Görseli R2'ye yükler ve slotu doldurur.
 *
 * Anahtar **deterministik** (`site/<slot>.<uzantı>`): aynı slota ikinci yükleme aynı objeyi ezer,
 * kovada yetim dosya birikmez. Bedeli sürüm damgasıdır ve `put` onu yazıyor — damga olmasaydı yeni
 * dosya bir yıllık `immutable` cache'in arkasında kalır, operatör "yükledim ama değişmedi" derdi.
 */
export async function uploadSiteImageAction(slot: string, form: FormData): Promise<ActionResult> {
  try {
    await requireAdmin();
    const target = slotOf(slot);
    const file = readImageUpload(form);

    const r2 = getR2();
    // Kova ayarsızsa yükleme SESSİZCE başarısız olmamalı: kayıt yazılıp dosya yazılmasaydı ekran
    // "dolu" gösterir, müşteri yüzeyi boş çerçeve çizerdi.
    if (!r2) throw new Error('Depolama (R2) ayarlı değil — görsel yüklenemez.');

    const key = r2Keys.siteImage(target, file.name);
    // Biçim kapıda doğrulandı (`readImageUpload`); eski `|| 'image/jpeg'` yedeği bir tahmindi.
    await r2.uploadFile(key, Buffer.from(await file.arrayBuffer()), file.type);
    await new SiteImageService(serviceDb()).put(target, key);

    revalidateSurfaces();
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** Odak/zoom — dosyaya dokunmaz. Kayıt yoksa yazacak bir şey de yok (önce yükleme gerekir). */
export async function saveSiteImageCropAction(id: string, crop: ImageCrop): Promise<ActionResult> {
  try {
    await requireAdmin();
    await new SiteImageService(serviceDb()).setCrop(id, {
      imageFocalX: crop.x,
      imageFocalY: crop.y,
      imageZoom: crop.zoom,
    });
    revalidateSurfaces();
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Alternatif metin — **isteğe bağlı** ve boş bırakılması bir eksiklik değil.
 *
 * Müşteri şeridinin kuralı: operatörün yazdığı varsa o kazanır, yoksa sayfanın kendi metni kalır
 * (Paketler ve boş sepette varsayılan BOŞ — dekoratif görsel, yanındaki başlık aynı şeyi söylüyor).
 * Bu yüzden tümü boş bir giriş `null` yazar: boş bir nesne saklamak, "operatör yazdı ama boş yazdı"
 * ile "hiç yazmadı"yı ayırt edilemez kılardı.
 */
export async function saveSiteImageAltAction(id: string, alt: LocalizedText): Promise<ActionResult> {
  try {
    await requireAdmin();
    const cleaned = Object.fromEntries(
      Object.entries(alt).flatMap(([lang, text]) => {
        const trimmed = typeof text === 'string' ? text.trim() : '';
        return trimmed ? [[lang, trimmed] as const] : [];
      }),
    );
    // Adanmış bir kapı yok (`setCrop` emsali) çünkü alan künyeden geliyor; genel `update` zaten
    // şemayla daralıyor (`SiteImageUpdateSchema`), yani ikinci bir yazma yolu açılmıyor.
    await new SiteImageService(serviceDb()).update({
      id,
      imageAlt: Object.keys(cleaned).length > 0 ? cleaned : null,
    });
    revalidateSurfaces();
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Slotu boşaltır — ekran yer tutucusuna döner.
 *
 * **Kovadaki obje SİLİNMİYOR** ve bu bilinçli: anahtar deterministik olduğu için aynı slota yeni bir
 * yükleme onu zaten ezecek, yani yetim birikmiyor. Silmeye kalksaydık kova erişilemezken satırı da
 * silememek gerekirdi — yoksa ekran boşalır, dosya kalır ve kimse ikisinin ayrıştığını bilmezdi.
 */
export async function clearSiteImageAction(slot: string): Promise<ActionResult> {
  try {
    await requireAdmin();
    await new SiteImageService(serviceDb()).clear(slotOf(slot));
    revalidateSurfaces();
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Değişen görselin göründüğü YOLLAR — ayarlar ekranı + müşteri sayfaları.
 *
 * Müşteri tarafı `layout` kökünden tazeleniyor: dört slot dört ayrı sayfada ve hangi slotun
 * değiştiğine göre yol seçmek, dilli adresleri (fr/de/tr) de hesaba katmayı gerektirirdi. Operatör
 * "yükledim ama sitede eski görünüyor" dememeli; kapsam geniş tutuluyor.
 */
function revalidateSurfaces(): void {
  revalidatePath(SETTINGS_PATH);
  revalidatePath('/', 'layout');
}
