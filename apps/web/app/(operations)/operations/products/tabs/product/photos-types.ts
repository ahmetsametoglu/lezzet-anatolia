import type { ProductImage } from '@lezzet/types';

// Galeri bloğunun tipi — kendi dosyasında, çünkü hem `product-photos` hem `actions` okuyor ve tip
// ikisinden birine konsaydı döngüsel bağımlılık doğardı (depcruise no-circular).
//
// Ürün FORMUNUN sözleşmesinde DEĞİL (22.14): galeri canlı yazar (yükleme, sıralama, kapak seçimi
// anında kaydedilir) ve forma bağlı değildir; forma slot olarak giriyor. Ortak form komponentine
// taşınsaydı, kuyruk da onu görürdü — oysa onay beklemeyen bir yazma yolu kuyruğun vaadini deler.

/**
 * Galeri fotoğrafının form/görünüm hâli — varlıktan TÜRER, alanları yeniden yazılmaz. Tek ek:
 * çözülmüş okuma URL'i (`imageKey` ham anahtar; adres sunucuda kurulur).
 */
export type ProductPhotoView = ProductImage & { imageUrl: string | null };
