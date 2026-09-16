// DB relative anahtar tutar, prefix yalnız R2 çağrısında eklenir; yazma kimlik bilgisi ister, public
// okuma saf URL birleştirir.
export { getR2, getR2Private } from './r2.service';
export { financeDocumentScope, r2Keys, ticketAttachmentScope, type TicketAttachmentScope } from './r2-keys';
export { cdnImageUrl, publicImageUrl, type CdnImageFormat, type CdnImageOptions } from './r2-public';
export { privateReadUrl, privateReadUrls, privateUploadUrl } from './r2-private';
