// @lezzet/storage — Cloudflare R2 (S3-uyumlu) dosya deposu. DB relative key tutar, prefix R2'de uygulanır.
// Yazma yolu kimlik bilgisi ister (getR2); okuma public bucket üzerinden saf URL kurar (publicImageUrl).
export { getR2 } from './r2.service';
export { r2Keys } from './r2-keys';
export { publicImageUrl } from './r2-public';
