/**
 * Anahtar biçimini bilen TEK yer: biçim ikinci bir yere yazılsaydı, biri değişince öteki sessizce
 * yanlış anahtar üretir ya da yanlış anahtarı kabul ederdi. DB relative anahtar tutar, prefix R2
 * çağrısında eklenir.
 */
const sanitize = (s: string): string =>
  s.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();

// Kaynak dosya adından uzantıyı çıkarır (yoksa 'jpg').
const extOf = (filename: string): string => {
  const m = /\.([a-zA-Z0-9]+)$/.exec(filename);
  return (m?.[1] ?? 'jpg').toLowerCase();
};

export const r2Keys = {
  /**
   * Slug'a bağlı deterministik anahtar, timestamp YOK: görsel değişince aynı objenin üstüne yazılır,
   * kovada yetim obje birikmez ve seed idempotent olur. `sourceFilename` yalnız uzantı içindir.
   */
  productImage: (slug: string, sourceFilename: string): string =>
    `catalog/products/${sanitize(slug)}.${extOf(sourceFilename)}`,

  /**
   * Galeri (ek) fotoğrafı — kapaktan farklı olarak ürün başına ÇOK dosya var, dolayısıyla anahtar
   * yalnız slug'dan türeyemez. `photoToken` fotoğrafa özgü tek kullanımlık bir kimliktir: aynı
   * fotoğraf yeniden yüklenmez, silinince nesnesi de silinir → yetim obje kalmaz.
   */
  productGalleryImage: (slug: string, photoToken: string, sourceFilename: string): string =>
    `catalog/products/${sanitize(slug)}-${sanitize(photoToken)}.${extOf(sourceFilename)}`,

  /** Koleksiyon kapak görseli — aynı deterministik desen (slug'a bağlı, timestamp yok). */
  collectionImage: (slug: string, sourceFilename: string): string =>
    `catalog/collections/${sanitize(slug)}.${extOf(sourceFilename)}`,

  /** Kategori KAPAĞI — aynı deterministik desen (slug'a bağlı, timestamp yok). */
  categoryImage: (slug: string, sourceFilename: string): string =>
    `catalog/categories/${sanitize(slug)}.${extOf(sourceFilename)}`,

  /**
   * Kategori başına ÇOK dosya var, dolayısıyla anahtar yalnız slug'dan türeyemez. `photoToken`
   * fotoğrafa özgü tek kullanımlık kimliktir; silinince nesnesi de silinir, yetim obje kalmaz.
   */
  categoryGalleryImage: (slug: string, photoToken: string, sourceFilename: string): string =>
    `catalog/categories/${sanitize(slug)}-${sanitize(photoToken)}.${extOf(sourceFilename)}`,

  /** Paket (bundle) görseli — 3:2 kaynak; aynı deterministik desen. */
  bundleImage: (slug: string, sourceFilename: string): string =>
    `catalog/bundles/${sanitize(slug)}.${extOf(sourceFilename)}`,

  /**
   * Kaynak **16:10, en az 1600×1000** ve tek kare yeter: web kartı, web detayı ve mobil hero aynı
   * kareden türer, kırpma oranı ekranın işidir. Slug'a bağlı ve timestamp'siz olması bir silme
   * kararıdır — görsel değişince aynı objenin üstüne yazılır, kovada yetim obje birikmez.
   */
  recipeImage: (slug: string, sourceFilename: string): string =>
    `catalog/recipes/${sanitize(slug)}.${extOf(sourceFilename)}`,

  /**
   * Bir varlığa değil bir SAYFA YERİNE ait olduğu için `catalog/` altında değil kendi klasöründe.
   * Anahtar slottan türer, kimlikten değil: slot kapalı bir kümedir ve her slot tek görsel taşır
   * (`site_image_slot_idx`), yeni yükleme aynı objenin üstüne yazar.
   */
  siteImage: (slot: string, sourceFilename: string): string => `site/${sanitize(slot)}.${extOf(sourceFilename)}`,

  /**
   * PRIVATE kova, public adresi YOK; talep kimliğine göre klasörlenir ki talep silinince ekleri tek
   * seferde temizlensin. Katalogun tersine **deterministik DEĞİL**: bozuk ürünün ikinci açısı
   * birincisinin üstüne yazmamalı, `photoToken` çağıranın ürettiği tek kullanımlık kimliktir.
   */
  ticketAttachment: (ticketId: string, photoToken: string, sourceFilename: string): string =>
    `support/tickets/${sanitize(ticketId)}/${sanitize(photoToken)}.${extOf(sourceFilename)}`,

  /**
   * Talep ancak "Gönder"de doğar, fotoğraf ondan önce seçilir: henüz bir talep kimliği olmadığı için
   * taslak ekler MÜŞTERİ klasörüne yazılır. Yan faydası, müşteri silindiğinde taslak klasörü de tek
   * seferde gider — kimsenin talebine bağlanmamış dosya ortada kalmaz.
   */
  ticketDraftAttachment: (customerId: string, photoToken: string, sourceFilename: string): string =>
    `support/tickets/drafts/${sanitize(customerId)}/${sanitize(photoToken)}.${extOf(sourceFilename)}`,

  /**
   * Sağlayıcıdan gelen PDF, ÖZEL kovada: etiketin üstünde alıcının adı ve adresi yazar, public bir
   * adreste dursaydı kutu kimliğini bilen biri müşterinin adresini okurdu. Kutuya çıpalı ve
   * deterministik — etiket yeniden alınırsa eskisinin üstüne yazılır, yetim obje kalmaz.
   */
  shippingLabel: (boxId: string): string => `shipping-labels/${sanitize(boxId)}.pdf`,

  /**
   * **Adresi değil medyanın KENDİSİNİ saklıyoruz:** sağlayıcının verdiği adres dakikalar içinde,
   * medyanın kendisi de yaklaşık bir ay sonra ölüyor; adres saklansaydı şikâyetin tek kanıtı talep
   * sonuçlanmadan kaybolurdu. Deterministik DEĞİL — bir sohbete sınırsız medya düşer ve `mediaToken`
   * çağıranın ürettiği tek kullanımlık kimliktir (sağlayıcının kimliği kanal değişince biçim
   * değiştirir, anahtar ona bağlanamaz).
   */
  conversationMedia: (conversationId: string, mediaToken: string, sourceFilename: string): string =>
    `messaging/conversations/${sanitize(conversationId)}/${sanitize(mediaToken)}.${extOf(sourceFilename)}`,

  /**
   * İmza çizimi ya da kapı fotoğrafı; PRIVATE kova, public adresi YOK. Deterministik DEĞİL: bir
   * teslimatta hem imza hem fotoğraf olabilir ve ikinci deneme de aynı siparişe yazar — anahtar
   * yalnız sipariş kimliğinden türeseydi ikincisi, "eksik geldi" ihtilafının tek sigortasının
   * üstüne yazardı.
   */
  deliveryProof: (orderId: string, photoToken: string, sourceFilename: string): string =>
    `delivery/proofs/${sanitize(orderId)}/${sanitize(photoToken)}.${extOf(sourceFilename)}`,

  /**
   * PRIVATE kova, public adresi YOK: belgede karşı tarafın adı, tutarı ve çoğu zaman banka bilgisi
   * yazar. Belge kimliğine göre klasörlenir ve deterministik — yeniden yüklenirse eskisinin üstüne
   * yazılır, yetim obje kalmaz; dosya adı uzantı dışında kullanılmaz.
   */
  financeDocument: (documentId: string, sourceFilename: string): string =>
    `finance/documents/${sanitize(documentId)}/belge.${extOf(sourceFilename)}`,
} as const;

/**
 * Belge anahtarının **hangi belgeye ait olduğu** — `ticketAttachmentScope` ile aynı gerekçe: imzalı
 * okuma adresi yetkisi doğrulanmış bir belge üzerinden üretilir, ama anahtarın gerçekten O belgeye
 * ait olduğu ayrıca kontrol edilmezse yetkisi olan biri private kovadaki başka bir anahtarı okutur.
 */
export function financeDocumentScope(key: string): string | null {
  const m = /^finance\/documents\/([^/]+)\/[^/]+$/.exec(key);
  return m ? m[1]! : null;
}

/**
 * Bir ek anahtarının **kime ait olduğu** — yetki kapısının sorduğu tek soru. Sahiplik yalnız TALEP
 * üzerinde doğrulanıp ANAHTAR üzerinde doğrulanmasaydı, müşteri private kovadaki herhangi bir dosyayı
 * kendi talebine iliştirip okutabilirdi: yetki doğrulanmış olurdu ama yanlış nesnenin.
 */
export type TicketAttachmentScope = { kind: 'ticket'; ticketId: string } | { kind: 'draft'; customerId: string } | null;

/**
 * Sohbet medyasının **hangi konuşmaya ait olduğu** — `ticketAttachmentScope` ile aynı iş, aynı
 * gerekçe: imzalı okuma adresi sahipliği doğrulanmış bir konuşma üzerinden üretiliyor, ama
 * anahtarın gerçekten O konuşmaya ait olduğu ayrıca kontrol edilmezse, yetkisi olan biri private
 * kovadaki başka bir anahtarı okutabilir. Yetki doğrulanır ama yanlış nesnenin.
 *
 * Anahtar biçimini bilen tek yer burasıdır; kapı biçimi yeniden ayrıştırmaz.
 */
export function conversationMediaScope(key: string): string | null {
  const m = /^messaging\/conversations\/([^/]+)\/[^/]+$/.exec(key);
  return m ? m[1]! : null;
}

export function ticketAttachmentScope(key: string): TicketAttachmentScope {
  const draft = /^support\/tickets\/drafts\/([^/]+)\/[^/]+$/.exec(key);
  if (draft) return { kind: 'draft', customerId: draft[1]! };

  const owned = /^support\/tickets\/([^/]+)\/[^/]+$/.exec(key);
  if (owned && owned[1] !== 'drafts') return { kind: 'ticket', ticketId: owned[1]! };

  return null;
}
