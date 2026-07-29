import { pino, type Logger } from 'pino';

/**
 * Yapılandırılmış log — gözlemlemenin birinci katmanı (`OBSERVABILITY §2`).
 *
 * **Üretimde JSON, geliştirmede okunur çıktı.** JSON şart çünkü log'un okuyucusu insan değil,
 * `grep`/`jq`: serbest metin bir satır ("Sipariş kaydedildi LA-26-99C7YN, toplam 47.50") aranabilir
 * değildir, alanlı satır aranabilirdir.
 *
 * **Yazma yeri stdout'tur, dosya değil.** Döndürme (rotate) süreç yöneticisinin işi (`pm2-logrotate`);
 * uygulama da dosyaya yazarsa iki yazan olur ve biri eksik kalır.
 *
 * Çağrı biçimi TEK — bağlam nesnesi önce, mesaj sonra:
 * ```ts
 * logger.error({ context: 'order/checkout', orderId, err: getErrorMessage(err) }, 'taslak açılamadı');
 * ```
 *
 * **Paket TEK, örnek iki değil.** Referans projede web ve backend'in ayrı ayrı kurduğu iki yapılandırma
 * var; burada tek yerde duruyor (CLAUDE.md §1 — hiçbir türde duplication yok). Seviye farkı ortam
 * değişkeniyle çözülüyor, ikinci bir dosyayla değil.
 *
 * **SUNUCU TARAFI.** `pino` node-only: istemci komponentinden import edilirse derleme kırılır.
 * Tarayıcıda log gerekiyorsa `console` kalır. Edge çalışma zamanında da çalışmaz — bugün edge
 * kullanılmıyor; kullanılırsa o rotada yedek gerekir.
 */

/**
 * Geliştirmede `pino-pretty` **iyimser** yüklenir: kurulu değilse (yalın bir kurulum, CI imajı)
 * pino boru hattını kuramaz ve fırlatır — logger'ın çökmesi, log'suz kalmaktan kötüdür. O yüzden
 * varlığı sınanır, yoksa sessizce JSON'a düşülür.
 */
function prettyTransport(): { target: string; options: Record<string, unknown> } | undefined {
  try {
    // `require.resolve` yok (ESM); çözümleme denemesi import.meta ile yapılır.
    import.meta.resolve?.('pino-pretty');
    return { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname' } };
  } catch {
    return undefined;
  }
}

const isProduction = process.env.NODE_ENV === 'production';

export const logger: Logger = pino({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  // Üretimde ham JSON: aktarım katmanı yok, doğrudan stdout.
  ...(isProduction ? {} : { transport: prettyTransport() }),
  // Hata nesnesi otomatik serileştirilir (mesaj + stack); `err` alan adı pino'nun kendi sözleşmesi.
  formatters: { level: (label) => ({ level: label }) },
});
