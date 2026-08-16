import type { GalleryImage, ImageCropFields } from '@lezzet/types';
import type { ActionResult } from '@/lib/error';

// Galeri bloğunun tipleri — kendi dosyasında, çünkü hem bileşen hem eylem dosyaları okuyor ve tip
// ikisinden birine konsaydı döngüsel bağımlılık doğardı (depcruise no-circular).
//
// ÜRÜN FORMUNUN KLASÖRÜNDEN BURAYA TAŞINDI (05.23): blok artık kategori diyaloğunda da çiziliyor
// (kategorinin fotoğraf havuzu), yani ürün formuna ait bir parça değil. Daha önce de bir kez
// taşınmıştı (11.08, ürün sekmesinden ortak forma) ve gerekçesi aynıydı — kullanıcı: *"eğer ben
// sistemde bir form kullanıyorsam o formu bire bir kopyala; code duplication olmasın."*

/**
 * Fotoğrafın form/görünüm hâli — varlıktan TÜRER, alanları yeniden yazılmaz. Tek ek: çözülmüş
 * okuma URL'i (`imageKey` ham anahtar; adres sunucuda kurulur).
 *
 * Gövde ORTAK (`GalleryImage`), sahibini gösteren alan yok: bileşen `productId`/`categoryId`
 * bilmiyor ve bilmemeli — hangi varlığın fotoğrafını yönettiğini yalnız eylem seti biliyor.
 */
export type GalleryPhotoView = GalleryImage & { imageUrl: string | null };

/**
 * Bloğun YAZMA YOLLARI — çağıran hangi varlığı yönetiyorsa onun server action'larını verir.
 *
 * Neden prop: bileşen eylemleri doğrudan import etseydi ürüne çivilenirdi ve kategori için ikinci
 * bir nüsha yazmak gerekirdi — aynı sürükle-bırak, aynı kırpma diyaloğu, aynı iskelet, iki kopya.
 * Eylemlerin İMZASI ortak, gövdeleri değil.
 */
export interface GalleryActions {
  list: (parentId: string) => Promise<ActionResult<GalleryPhotoView[]>>;
  upload: (parentId: string, form: FormData) => Promise<ActionResult<GalleryPhotoView>>;
  remove: (photoId: string) => Promise<ActionResult>;
  makeCover: (parentId: string, photoId: string) => Promise<ActionResult>;
  reorder: (orderedIds: string[]) => Promise<ActionResult>;
  setCrop: (photoId: string, crop: ImageCropFields) => Promise<ActionResult>;
}
