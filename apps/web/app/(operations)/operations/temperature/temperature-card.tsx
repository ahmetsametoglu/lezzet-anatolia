'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/operation/ui/button';
import { Input } from '@/components/operation/form/input';
import { FieldShell } from '@/components/operation/form/field-shell';
import { recordTemperatureAction } from './temperature-actions';
import { TEMPERATURE_NOTES, type TemperaturePoint } from './temperature-types';

/**
 * **Sıcaklık kaydı formu** (10.6) — `design/project/Operasyon - Depo Imha Sayim.dc.html`:
 * *"nokta → derece → kaydet"*.
 *
 * ── KENDİ DURUMUNU TAŞIYOR ──────────────────────────────────────────────────
 * Stoktan düşme formunun aksine dört prop'u üst komponentten almıyor. Sebep: iki form aynı ekranda
 * ama AYRI işler — biri stok düşürür, öteki hijyen defterine yazar; state'leri iç içe geçseydi
 * "kaydediliyor" bayrağı ikisini birden kilitlerdi ve sıcaklık girerken imha formu donardı.
 *
 * ── NOKTA SEÇİLİR, YAZILMAZ (19.28) ─────────────────────────────────────────
 * Serbest yazım kutusu KALKTI. Gerekçesi eski künyesinde yazılıydı: küme geçmiş kayıtlardan
 * türüyordu, yeni bir dolap hiç görünmüyordu, o yüzden yazım açıktı. Ama açık yazım bedelini de
 * getiriyordu — ilk yazım hatası ("Dolap-1") kalıcı bir çip hâline geliyor, ikinci kez tıklanıyor
 * ve o noktanın geçmişi ikiye bölünüyordu. Noktalar artık tanımlı (`storage_area` · `vehicle`);
 * yeni dolap Depolar ekranından eklenir ve buraya ilk günden çip olarak gelir.
 *
 * ── UYARI KAYITTAN SONRA ────────────────────────────────────────────────────
 * Aralık dışı değer YAZILIR, sonra uyarılır (`DOMAIN §4` — karar sahadaki insanın). Cümle
 * "kaydedildi" ile başlıyor: uyarıyı ret sanan depocu aynı ölçümü ikinci kez girerdi.
 */
interface TemperatureCardProps {
  points: TemperaturePoint[];
}

export function TemperatureCard({ points }: TemperatureCardProps) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; warn: boolean } | null>(null);

  const [pointKey, setPointKey] = useState('');
  const [degree, setDegree] = useState('');

  const selected = points.find((point) => `${point.kind}:${point.id}` === pointKey) ?? null;
  const value = Number(degree.replace(',', '.'));
  const engel = !selected ? 'Nokta seçin.' : !Number.isFinite(value) || !degree.trim() ? 'Derece girin.' : null;

  const submit = () => {
    if (engel || !selected) return;
    setError(null);
    setNotice(null);

    startTransition(async () => {
      const { data, error: failed } = await recordTemperatureAction({
        kind: selected.kind,
        pointId: selected.id,
        temperatureC: value,
      });
      if (failed || !data) {
        setError(failed ?? 'Kayıt yazılamadı.');
        return;
      }

      /**
       * Cümle DAİMA "kaydedildi" ile başlıyor: uyarıyı ret sanan depocu aynı ölçümü ikinci kez
       * girerdi. Sapmanın SEBEBİ de söyleniyor ve iki sebep iki ayrı cümle — "beklenen aralığın
       * dışında" kesin bir ihlaldir, "genelde şu kadar okuyor" ise bir şüphe. Aynı kelimeyle
       * söylenselerdi operatör ikisine aynı ağırlığı verirdi.
       */
      setNotice(
        data.deviation === 'target'
          ? {
              text: `${data.name} kaydedildi — ${fmt(value)}. Beklenen aralık ${range(selected)}; bu ölçüm dışında.`,
              warn: true,
            }
          : data.deviation === 'habit' && data.usualC !== null
            ? {
                text: `${data.name} kaydedildi — ${fmt(value)}. Bu nokta genelde ${fmt(data.usualC)} okuyor; yazım hatası mı, gerçek sorun mu?`,
                warn: true,
              }
            : { text: `${data.name} kaydedildi — ${fmt(value)}`, warn: false },
      );
      setPointKey('');
      setDegree('');
      router.refresh();
    });
  };

  return (
    <div className="mt-2 flex flex-col gap-3 rounded-ops-card border border-ops-line bg-ops-subtle px-3.5 py-3">
      <div className="flex flex-col gap-0.5">
        <span className="font-ops-display text-ops-sm font-semibold text-ops-ink">Sıcaklık kaydı</span>
        <span className="font-ops-body text-ops-micro leading-[1.5] text-ops-faint">{TEMPERATURE_NOTES.hint}</span>
      </div>

      {points.length === 0 ? (
        // Boş hâl bir SONUÇTUR ve yolu gösterir: nokta tanımlamadan ölçüm yazılamaz, ve tanımın
        // yeri bu ekran değil (nokta bir tesisin künyesidir, günün kaydı değil).
        <p className="rounded-ops-btn border border-ops-amber-line bg-ops-amber-bg px-3 py-2 font-ops-body text-ops-sm text-ops-amber-dark">
          {TEMPERATURE_NOTES.empty}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {points.map((point) => {
            const key = `${point.kind}:${point.id}`;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setPointKey(key)}
                disabled={busy}
                className={`flex cursor-pointer items-center gap-1.5 rounded-ops-btn border px-3 py-1.5 font-ops-body text-ops-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  pointKey === key
                    ? 'border-ops-olive bg-ops-olive-bg font-semibold text-ops-olive-dark'
                    : 'border-ops-line-strong text-ops-strong hover:border-ops-olive'
                }`}
              >
                {point.name}
                {/* Bugün ölçülmemiş nokta çipte de İŞARETLİ: depocu listeyi yukarıdan aşağı
                    okumadan hangisinin eksik olduğunu görsün — turun sırası çipte belli. */}
                {point.temperatureC === null ? <span className="text-ops-amber">•</span> : null}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-end gap-2.5">
        {/* `fullWidth={false}` ŞART: kabuğun `w-full`'ü açık kalırsa derece kutusu satırı kaplar ve
            yanındaki alan ezilir (ölçüldü 08.08, tarif diyaloğunda birebir yaşandı). */}
        <FieldShell label="Derece" className="flex-none">
          <Input
            type="number"
            step="0.1"
            inputMode="decimal"
            placeholder="-18,5"
            fullWidth={false}
            className="w-28"
            value={degree}
            onChange={(event) => setDegree(event.target.value)}
            disabled={busy}
          />
        </FieldShell>
        <Button variant="secondary" disabled={busy || Boolean(engel)} onClick={submit}>
          {busy ? 'Kaydediliyor…' : 'Kaydet'}
        </Button>
      </div>

      {engel && !error && !notice ? <span className="font-ops-body text-ops-xs text-ops-muted">{engel}</span> : null}
      {error ? (
        <p className="rounded-ops-btn border border-ops-red-line bg-ops-red-bg px-3 py-2 font-ops-body text-ops-sm text-ops-red">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          className={`rounded-ops-btn border px-3 py-2 font-ops-body text-ops-sm ${
            notice.warn
              ? 'border-ops-amber-line bg-ops-amber-bg text-ops-amber-dark'
              : 'border-ops-olive-line bg-ops-olive-bg text-ops-olive-dark'
          }`}
        >
          {notice.text}
        </p>
      ) : null}
    </div>
  );
}

/**
 * "−18,5°" — operasyon yüzeyi Türkçe, ondalık ayracı virgül.
 *
 * Eksi işareti U+2212 (`−`), tire (`-`) değil: çizimde öyle yazıyor (`Operasyon - Depo Imha
 * Sayim.dc.html`) ve sebebi tipografik değil okunaklılık — mono yazıtipinde tire, rakamların
 * yanında bir ayraç gibi okunuyor ("18,5 ile 3,6 arası" gibi). `toLocaleString` ASCII tire
 * verdiği için burada çevriliyor.
 */
function fmt(celsius: number): string {
  return `${celsius.toLocaleString('tr-TR', { maximumFractionDigits: 1 }).replace('-', '−')}°`;
}

/** "−20° … −16°" — beklenen aralık. Yalnız ikisi de tanımlıyken çağrılır (kısıt bunu garantiliyor). */
function range(point: TemperaturePoint): string {
  return point.targetMinC === null || point.targetMaxC === null ? '' : `${fmt(point.targetMinC)} … ${fmt(point.targetMaxC)}`;
}

/**
 * **Bugünün şeridi** — tasarımın *"ölçülmemiş nokta amber görünür kalır"* kuralının karşılığı
 * (`Operasyon - Depo Imha Sayim.dc.html`, "Sıcaklık · bugün").
 *
 * Ekranda BUGÜNE KADAR HİÇ ÇİZİLMİYORDU ve çizilemezdi: nokta kümesi geçmiş kayıtlardan türediği
 * için "ölçülmemiş nokta" diye bir şey görünmüyordu — ölçülmeyen nokta listede de yoktu. Noktalar
 * tanımlı olunca eksik ölçüm ilk kez bir SAYI hâline geldi; denetimin ilk sorusu da bu.
 */
export function TemperatureToday({ points }: TemperatureCardProps) {
  if (points.length === 0) return null;
  const pending = points.filter((point) => point.temperatureC === null).length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <span className="font-ops-display text-ops-sm font-semibold text-ops-ink">Bugün</span>
        <span className={`font-ops-body text-ops-xs ${pending > 0 ? 'text-ops-amber-dark' : 'text-ops-muted'}`}>
          {pending > 0 ? TEMPERATURE_NOTES.pending(pending) : TEMPERATURE_NOTES.allDone}
        </span>
      </div>

      <ul className="flex flex-col rounded-ops-card border border-ops-line">
        {points.map((point) => (
          <li
            key={`${point.kind}:${point.id}`}
            className="flex items-baseline gap-2 border-b border-ops-line-soft px-3 py-2 last:border-b-0"
          >
            <span className="min-w-0 flex-1 truncate font-ops-body text-ops-sm text-ops-ink">{point.name}</span>
            {/* Beklenen aralık satırda: sapma cümlesi ancak beklentiyle birlikte okunur. */}
            {point.targetMinC !== null ? (
              <span className="shrink-0 font-ops-mono text-ops-micro text-ops-faint">{range(point)}</span>
            ) : null}
            {point.temperatureC === null ? (
              // Ölçülmedi ≠ sıfır (`CLAUDE §1`): rakam değil, eksikliğin kendisi yazılıyor.
              <span className="shrink-0 font-ops-body text-ops-xs text-ops-amber-dark">ölçülmedi</span>
            ) : (
              <span
                className={`shrink-0 font-ops-mono text-ops-sm ${
                  point.deviation === 'target'
                    ? 'text-ops-red'
                    : point.deviation === 'habit'
                      ? 'text-ops-amber-dark'
                      : 'text-ops-strong'
                }`}
              >
                {fmt(point.temperatureC)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
