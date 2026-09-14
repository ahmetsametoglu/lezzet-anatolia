/*
  GİRİŞ SONRASI İŞLER (21.310) — oturum kurulduktan SONRA koşan, UYGULAMAYA ÖZGÜ adımların kaydı.

  Kod girişi (`otp.ts`) ve Google dönüşü (`oauth.ts`) oturumu kurduktan sonra buraya uğrar; kapı
  giriş yöntemini BİLMEZ, yalnız "oturum kuruldu"yu bilir. Davet bağlamasının dersi (21.44): iki giriş
  yolu tek kapıdan geçmediğinde Google'dan kaydolan davetli sessizce bağsız kalıyordu.

  NEDEN KAYIT, NEDEN DOĞRUDAN ÇAĞRI DEĞİL: bu kapı ortak çekirdekte (`@lezzet/mobile-kit`) ve kit
  uygulamaya bağlanamaz. Bugünkü tek iş müşteri uygulamasının davet bağlaması
  (`lib/invite/invite-api` → `claimPendingInvite`); uygulama onu kökünde kaydeder. Operasyon
  uygulamasının davet akışı yok, kaydı da yok.

  Hata sözleşmesi kayıtlı işindir: bir iş fırlatırsa giriş sonucu da fırlatır. Davet kapısı kendi
  hatasını karşılıyor (künyesi orada), yani bugün bu yol fırlatmıyor.
*/

const effects = new Set<() => Promise<void>>();

/** Uygulamanın giriş sonrası işini kaydeder; dönen fonksiyon kaydı bırakır. */
export function registerSignInEffect(effect: () => Promise<void>): () => void {
  effects.add(effect);
  return () => {
    effects.delete(effect);
  };
}

/** Oturum kurulduktan sonra çağrılır; kayıtlı işlerin hepsi bitmeden dönmez. */
export async function runSignInEffects(): Promise<void> {
  await Promise.all([...effects].map((effect) => effect()));
}
