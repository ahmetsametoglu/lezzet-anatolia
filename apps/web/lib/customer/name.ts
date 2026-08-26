/**
 * KÖPRÜ (21.12) — gövde `@lezzet/application/customer/label`a terfi etti: adsız müşteri kuralını
 * artık iki yüzey okuyor (web operasyon + mobil yönetim) ve kural iki yerde iki kez yazılamazdı.
 * Künyesi (OTP'yle giren müşterinin adı boş dizge, maskeleme YOK gerekçesi) paket dosyasında.
 */
export { customerLabel } from '@lezzet/application';
