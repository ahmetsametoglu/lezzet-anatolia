// @lezzet/application — UYGULAMA katmanı: saf kararı (domain-core) ve saf I/O'yu (database)
// birleştiren, TAŞIMA-BAĞIMSIZ orkestrasyonlar. Ne çerez bilir ne Bearer; çağıran yüzey
// (Next action, Hono ucu) sonucu kendi taşıma diline çevirir.
//
// Paket 02-mimari §3.1'in ("terfi, kopya değil") ilk vatandaşıyla kuruldu (21.4a): e-posta OTP
// giriş akışı — web'in `otp-actions.ts`'i geçiş döneminde köprü olarak durur, benimsemesi talep
// dosyasıyla gider. Buraya giren her akışın ölçütü aynıdır: EN AZ İKİ yüzeyin çağırdığı (ya da
// çağıracağı) bir orkestrasyon olması. Tek yüzeyin işi kendi uygulamasında kalır.
export { requestOtpCode, verifyOtpCode } from './auth/otp';
export type { RequestOtpCodeResult, VerifyOtpCodeResult } from './auth/otp';
