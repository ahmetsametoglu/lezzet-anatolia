/*
  GOOGLE DÖNÜŞÜNÜN DEVRİ (21.312) — dönüş rotası (`app/auth/callback.tsx`) PKCE kodunu giriş ekranına bırakır,
  değişimi ekran yapar.

  NİÇİN ROTA DEĞİŞTİRMİYOR: tasarım Google doğrulamasını giriş ekranının ÜSTÜNDE bir örtüyle çiziyor ("Google
  hesabı doğrulanıyor") ve ardından aynı ekranda "hazır"a geçiyor; kayıt kapısının cevabı (bu girişte doğan
  hesap silinir) da o ekranın uyarı kutusunda söylenir. Değişim dönüş rotasında kalsaydı akışın yarısı başka
  bir ekranda yaşardı ve sonucu girişe adres parametresiyle taşımak gerekirdi — altta duran giriş ekranının
  üstüne ikinci bir giriş açılırdı.

  İKİ YOL, TEK DEVİR: tarayıcıdan dönüşte giriş ekranı yığında altta ve AÇIKTIR — haberi dinleyiciden alır.
  Uygulama tarayıcıdayken kapatıldıysa dönüş soğuk açılıştır; giriş ekranı devirden SONRA doğar ve bekleyen
  devri açılışta okur. Devir okununca silinir: aynı kod iki kez değiştirilmesin.
*/

type OAuthHandoff = { code: string | null };

let pending: OAuthHandoff | null = null;
const listeners = new Set<() => void>();

/** Dönüş rotası çağırır. `null`: bağlantı kodsuz geldi (elle açılmış adres ya da sağlayıcı reddi). */
export function handOffOAuthCode(code: string | null): void {
  pending = { code };
  listeners.forEach((listener) => listener());
}

/** Giriş ekranı çağırır — bekleyen devri TÜKETİR. */
export function takeOAuthCode(): OAuthHandoff | null {
  const handoff = pending;
  pending = null;
  return handoff;
}

/** Giriş ekranı açıkken gelen devrin haberi; dönen fonksiyon aboneliği kapatır. */
export function onOAuthCode(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
