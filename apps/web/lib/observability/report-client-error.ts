'use server';

import { captureError, SOURCES } from '@lezzet/observability';

/**
 * İSTEMCİ hatasını sunucuya bildirir — hata sınırlarının tek kapısı (denetim G1).
 *
 * ── NEDEN VAR ────────────────────────────────────────────────────────────────
 * Üç hata sınırı (`global-error` · müşteri `error` · operasyon `error`) hatayı yalnız tarayıcı
 * konsoluna yazıyordu: müşterinin ya da personelin gördüğü HER hata ekranı sunucuda **sıfır iz**
 * bırakıyordu. `instrumentation.onRequestError` bunları yakalamaz (o bir sunucu kancası), `pino`
 * istisnası da bunu kapsamıyordu — o istisnanın kapsamı "istemcide pino koşmaz"dı, "istemci hatası
 * hiç kaydedilmez" değil. Bedeli yaşandı: bir imleç hatası aylarca gizli kaldı (18.5 kaydı).
 *
 * Operasyon `error.tsx` bu boşluğu kendi içinde zaten not etmişti ("hata izleme servisi bağlanınca
 * buraya gönderilir"); bu dosya o notun karşılığı.
 *
 * ── KİMLİK GİDER, İÇERİK GİTMEZ (`OBSERVABILITY §5`) ─────────────────────────
 * Yalnız üç şey: **yol · digest · mesajın İLK SATIRI.** Yığın izi GÖNDERİLMEZ ve bu bilinçli —
 * istemci yığını üretimde zaten küçültülmüş (okunmaz) ve bir bileşen adının ötesinde ne taşıdığı
 * garanti edilemez. Teşhis için `digest` yeter: aynı hatanın sunucu tarafı kaydıyla eşleşir.
 *
 * ── KAPI HERKESE AÇIK, VE BU BİR ÖDÜNLEŞME ──────────────────────────────────
 * Guard YOK ve olamaz: müşteri yüzeyinin hata sınırı oturumsuz ziyaretçide de tetiklenir, kapıyı
 * kimliğe bağlamak tam da en çok gereken hâli kör bırakırdı. Bedeli, uydurma kayıt yazılabilmesi.
 * Üç sınır bunu tutuyor: kaynak SABİT (`web-client` — çağıran seçemez), mesaj **tek satır ve 200
 * karakter** ile kırpılır, ve aynı parmak izi süreç içinde dakikada bir kez gider. Kalan risk
 * "kayıt tablosuna çöp yazılabilir"dir; kayıt zaten parmak iziyle gruplanıp sayaç artırdığı için
 * bunun tavanı bir satırdır — bir tablo şişmesi değil.
 */

/** Aynı hatanın tekrar tekrar gönderilmesini keser — süreç içi, TTL'li. */
const gonderildi = new Map<string, number>();
const PENCERE_MS = 60_000;

/** Mesajın kayda giren hâli: ilk satır, kırpılmış. Çok satırlı mesaj yığın izi taşıyabilir. */
const TEK_SATIR_TAVANI = 200;

export async function reportClientErrorAction(input: {
  message: string;
  digest?: string | null;
  /** Hatanın oluştuğu yol (`window.location.pathname`) — sorgu dizesi YOK (kimlik taşıyabilir). */
  path?: string | null;
}): Promise<void> {
  const message = (input.message ?? '').split('\n')[0]?.trim().slice(0, TEK_SATIR_TAVANI) || 'İstemci hatası (mesaj yok)';
  const digest = input.digest?.trim() || null;
  const path = input.path?.trim() || null;

  const anahtar = `${digest ?? message}::${path ?? ''}`;
  const simdi = Date.now();
  const son = gonderildi.get(anahtar);
  if (son !== undefined && simdi - son < PENCERE_MS) return;
  gonderildi.set(anahtar, simdi);
  // Harita sınırsız büyümesin: pencere geçmiş girdiler temizlenir (küme zaten küçük).
  for (const [k, t] of gonderildi) if (simdi - t >= PENCERE_MS) gonderildi.delete(k);

  // Kaynak dizesi SABİT: çağıran seçemez. Sözlükten gelir (`SOURCES.webClient`) — elle yazılan
  // `'web-client'` ile `'web client'` ekranda iki ayrı kaynak gibi görünürdü.
  await captureError(new Error(message), {
    source: SOURCES.webClient,
    path,
    context: digest ? { digest } : {},
  });
}
