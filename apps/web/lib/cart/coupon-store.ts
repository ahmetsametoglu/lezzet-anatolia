/**
 * Girilen kupon kodunun tarayıcı deposu.
 *
 * **Kod bir NİYETTİR, bir hak değil** — sepet kalemleriyle aynı katman (`CartEntry` → niyet,
 * `CartLine` → görünüm). Kuponun geçerli olup olmadığına, ne kadar indirdiğine ve hatta kazanıp
 * kazanmadığına her okumada sunucu karar verir (`resolveCartDiscount`); burada saklanan tek şey
 * müşterinin "şu kodu denedim" cümlesidir. Bu yüzden tutar ya da indirim kimliği ASLA yazılmaz:
 * yazılsaydı tarayıcıda saklanan bir indirim doğardı.
 *
 * **Neden sunucudaki sepette değil:** `cart` tablosunda kupon kolonu yok ve açmak bir migration
 * (+ `db:reset`) demekti. Kod kalıcı bir veri de değil — sepet boşalınca ya da kupon süresi
 * dolunca anlamını yitiriyor. Girişli müşteride de tarayıcıda durması bu yüzden yeterli: her
 * okumada zaten yeniden değerlendiriliyor.
 */
const KEY = 'lezzet.coupon.v1';

export function readCoupon(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(KEY) || null;
  } catch {
    // Depo kapalı (gizli sekme, kota): kupon girilmemiş sayılır. Sessizlik bilinçli — yazma
    // tarafındaki gerekçenin aynısı, kupon uğruna ekranı kırmayız.
    return null;
  }
}

export function writeCoupon(code: string | null): void {
  try {
    if (code) window.localStorage.setItem(KEY, code);
    else window.localStorage.removeItem(KEY);
  } catch {
    // Depo kapalı (gizli sekme, kota): kod bu oturumda yaşar, sonraki açılışta kaybolur — sepetin
    // kendisi de aynı kaderde. Sessiz düşmek doğru: kupon uğruna ekranı kırmayız.
  }
}
