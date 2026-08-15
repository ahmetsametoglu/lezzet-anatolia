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
 * ── NOKTA SEÇİLİR, GEREKİRSE YAZILIR ────────────────────────────────────────
 * Bilinen noktalar çip olarak sunuluyor (giriş 10 saniyeden uzun sürmemeli — tasarımın ölçütü);
 * ama küme geçmiş kayıtlardan türediği için YENİ bir nokta (yeni dolap, yeni araç) hiç görünmez.
 * O yüzden serbest yazım da açık: ilk kayıt noktayı kümeye sokar ve ertesi gün çip olarak çıkar.
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

  const [location, setLocation] = useState('');
  const [degree, setDegree] = useState('');

  // Çipler yalnız BİLİNEN noktalar; serbest yazım ayrı kutuda. İkisi tek alanda birleşseydi
  // "Dolap 1" yazan operatör var olan noktaya mı yazıyor yoksa yenisini mi açıyor bilemezdi.
  const known = points.map((point) => point.name);
  const value = Number(degree.replace(',', '.'));
  const engel = !location.trim() ? 'Nokta seçin.' : !Number.isFinite(value) || !degree.trim() ? 'Derece girin.' : null;

  const submit = () => {
    if (engel) return;
    setError(null);
    setNotice(null);

    startTransition(async () => {
      const { data, error: failed } = await recordTemperatureAction({ location: location.trim(), temperatureC: value });
      if (failed || !data) {
        setError(failed ?? 'Kayıt yazılamadı.');
        return;
      }

      // Cümle DAİMA "kaydedildi" ile başlıyor: uyarıyı ret sanan depocu aynı ölçümü ikinci kez
      // girerdi. Sıra dışıysa noktanın kendi alışkanlığı söyleniyor — "beklenmedik" demek yetmez,
      // operatör neye göre beklenmedik olduğunu görmeli.
      setNotice(
        data.unusual
          ? {
              text: `${data.location} kaydedildi — ${fmt(value)}. Bu nokta genelde ${fmt(data.unusual.usualC)} okuyor; yazım hatası mı, gerçek sorun mu?`,
              warn: true,
            }
          : { text: `${data.location} kaydedildi — ${fmt(value)}`, warn: false },
      );
      setLocation('');
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

      {known.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {known.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setLocation(name)}
              disabled={busy}
              className={`cursor-pointer rounded-ops-btn border px-3 py-1.5 font-ops-body text-ops-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                location === name
                  ? 'border-ops-olive bg-ops-olive-bg font-semibold text-ops-olive-dark'
                  : 'border-ops-line-strong text-ops-strong hover:border-ops-olive'
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex items-end gap-2.5">
        <FieldShell label="Nokta" className="flex-1">
          <Input
            placeholder="Dolap 1 · Araç 67 ABC"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            disabled={busy}
          />
        </FieldShell>
        {/* `fullWidth={false}` ŞART: kabuğun `w-full`'ü açık kalırsa derece kutusu satırı kaplar ve
            yanındaki nokta alanı ezilir (ölçüldü 08.08, tarif diyaloğunda birebir yaşandı). */}
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
