// @lezzet/storage — Cloudflare R2 (S3-uyumlu) dosya deposu. DB relative key tutar, prefix R2'de uygulanır.
// Yazma yolu kimlik bilgisi ister (getR2); okuma public bucket üzerinden saf URL kurar (publicImageUrl).
export { getR2, getR2Private } from './r2.service';
export { conversationMediaScope, r2Keys, ticketAttachmentScope, type TicketAttachmentScope } from './r2-keys';
export { cdnImageUrl, publicImageUrl, type CdnImageFormat, type CdnImageOptions } from './r2-public';
export { privateReadUrl, privateReadUrls, privateUploadUrl } from './r2-private';
