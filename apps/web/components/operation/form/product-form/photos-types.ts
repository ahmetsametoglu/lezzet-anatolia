import type { ProductImage } from '@lezzet/types';

// Galeri bloğunun tipi — kendi dosyasında, çünkü hem `photos` hem eylem dosyası okuyor ve tip
// ikisinden birine konsaydı döngüsel bağımlılık doğardı (depcruise no-circular).
//
// ÜRÜN SEKMESİNİN KLASÖRÜNDEN BURAYA TAŞINDI (11.08). 22.14'te galeri "kuyruğa girmesin" diye
// dışarıda bırakılmıştı; kullanıcı bunu ekranda gördü ve kaldırttı — *"eğer ben sistemde bir form
// kullanıyorsam o formu bire bir kopyala; görüntüde bazı şeyleri kırpma."* Blok artık iki yüzeyde
// de aynı, o yüzden tipi de ortak forma ait.
//
// Alan olarak DEĞİL slot olarak duruyor (`ProductFormFields.image`): galeri CANLI yazar (yükleme,
// sıralama, kapak seçimi anında kaydedilir) ve formun "kaydet"ine bağlı değildir.

/**
 * Galeri fotoğrafının form/görünüm hâli — varlıktan TÜRER, alanları yeniden yazılmaz. Tek ek:
 * çözülmüş okuma URL'i (`imageKey` ham anahtar; adres sunucuda kurulur).
 */
export type ProductPhotoView = ProductImage & { imageUrl: string | null };
