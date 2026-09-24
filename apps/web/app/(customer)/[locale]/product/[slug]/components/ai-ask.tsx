import type { Messages } from '../product-types';

/**
 * "Bu ürünü yapay zekâya sorun": hazır soru ve sohbet servislerine bağlantı. Soru kategoriden gelir (`category.ai_question`);
 * sorusu girilmemiş kategoride bölüm hiç çizilmez, çünkü uydurulmuş soru üçüncü taraf modeline yanlış bağlam gönderirdi.
 */

/**
 * Servisler ve soruyu adres satırında taşıma biçimleri; ad markanın kendi yazımıdır, çevrilmediği için sözlükte değil burada durur.
 * Listede yalnız soruyu adres satırından alan servis durur: Gemini `?q=`yu yok sayıp boş kutuyla açılıyor.
 */
const SERVICES: { name: string; url: (question: string) => string }[] = [
  { name: 'Claude', url: (q) => `https://claude.ai/new?q=${encodeURIComponent(q)}` },
  { name: 'ChatGPT', url: (q) => `https://chatgpt.com/?q=${encodeURIComponent(q)}` },
];

export function AiAsk({ t, question }: { t: Messages['ai']; question: string }) {
  return (
    <div className="flex flex-col gap-1.75 border-t border-sand-300 pt-4.25">
      <div className="flex flex-wrap items-center gap-x-6.5 gap-y-3">
        <span className="flex min-w-[340px] flex-1 flex-col gap-1">
          <span className="font-sans text-body-sm font-bold text-ink">{t.title}</span>
          <span className="font-sans text-note leading-normal text-body">“{question}”</span>
        </span>
        <div className="flex flex-none gap-2">
          {SERVICES.map((s) => (
            <a
              key={s.name}
              href={s.url(question)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-pill border-[1.5px] border-sand-300 bg-card px-3.75 py-1.75 font-sans text-note font-bold text-ink transition-colors hover:border-olive hover:bg-olive-bg"
            >
              {s.name}
              <span aria-hidden className="font-normal text-muted">
                ↗
              </span>
            </a>
          ))}
        </div>
      </div>
      <span className="font-sans text-micro leading-normal text-muted">{t.note}</span>
    </div>
  );
}
