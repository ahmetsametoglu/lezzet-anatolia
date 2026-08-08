'use client';

import Link from 'next/link';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { PageHeader } from '@/components/operation/ui/page-header';
import { money, num } from '@/components/operation/ui/format';
import { RECIPE_NOTES, langBadge, recipeItemTitle, statusBadge } from './recipes-labels';
import type { RecipeView, RecipesData } from './recipes-types';

/**
 * **Tarifler** — liste + seçili tarifin önizlemesi (09.21).
 * `design/project/Operasyon - Tarifler.dc.html`.
 *
 * Panel SALT GÖRÜNÜM (tasarımın kendi rozeti: *"salt görünüm · Düzenle ile aç"*): tarif uzun bir
 * metindir ve yan panelde düzenlenmeye kalkışmak, üç dili 340 piksellik bir kolona sığdırmak
 * olurdu. Düzenleme diyalogda yapılır.
 *
 * Seçim ADRESTE (`?r=<id>`) ve satırlar `Link`: bir tarifin bağlantısı paylaşılabilmeli, ve bu
 * seçim için istemci durumu gerekmiyor — sunucu zaten o tarifin kalemlerini okuyor.
 */
interface RecipesViewProps {
  data: RecipesData;
  selectedId: string | null;
  busy: boolean;
  error: string | null;
  onCreate: () => void;
  onEdit: (recipe: RecipeView) => void;
  onTogglePublish: (recipe: RecipeView) => void;
}

export function RecipesDesktop({ data, selectedId, busy, error, onCreate, onEdit, onTogglePublish }: RecipesViewProps) {
  const selected = data.recipes.find((recipe) => recipe.id === selectedId) ?? null;
  const draftCount = data.recipes.length - data.activeCount;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ops-card">
      <PageHeader
        title="Tarifler"
        subtitle={`${num(data.recipes.length)} tarif · ${num(data.activeCount)} yayında · ${num(draftCount)} taslak`}
      >
        <Button variant="primary" size="sm" onClick={onCreate}>
          + Tarif
        </Button>
      </PageHeader>

      {error ? (
        <p className="mx-6 mt-3 rounded-ops-btn border border-ops-red-line bg-ops-red-bg px-3 py-2 font-ops-body text-ops-sm text-ops-red">
          {error}
        </p>
      ) : null}

      {data.recipes.length === 0 ? (
        <EmptyState title="Henüz tarif yok" description={RECIPE_NOTES.empty} />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-[1.95fr_1fr] overflow-hidden">
          <div className="flex min-h-0 flex-col border-r border-ops-line">
            {/* Sütunlar tasarımdan, "Malzeme" HARİÇ: kalem sayısı bugün okunmuyor (liste kalemsiz,
                N+1 olmasın diye) ve uydurma bir sayı yazmaktansa sütunu hiç çizmemek doğru.
                BEKLEYEN(09.21) */}
            <div className="grid grid-cols-[minmax(130px,1fr)_70px_92px_84px] gap-x-2.5 border-b border-ops-line bg-ops-subtle px-5 py-2.5 font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-muted">
              <span>Tarif</span>
              <span className="text-center">Süre</span>
              <span className="text-center">Diller</span>
              <span className="text-right">Durum</span>
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto">
              {data.recipes.map((recipe) => (
                <li key={recipe.id}>
                  <RecipeRow recipe={recipe} selected={recipe.id === selectedId} />
                </li>
              ))}
            </ul>
          </div>

          <aside className="flex min-h-0 flex-col overflow-y-auto bg-ops-panel">
            {selected ? (
              <RecipePreview
                recipe={selected}
                busy={busy}
                onEdit={() => onEdit(selected)}
                onTogglePublish={() => onTogglePublish(selected)}
              />
            ) : (
              <EmptyState title="Tarif seçin" description={RECIPE_NOTES.pick} />
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

function RecipeRow({ recipe, selected }: { recipe: RecipeView; selected: boolean }) {
  const status = statusBadge(recipe);
  const langs = langBadge(recipe);
  return (
    <Link
      href={`/operations/recipes?r=${recipe.id}`}
      className={`grid grid-cols-[minmax(130px,1fr)_70px_92px_84px] items-center gap-x-2.5 border-b border-ops-line-soft px-5 py-2.5 transition-colors hover:bg-ops-subtle ${
        selected ? 'bg-ops-olive-bg' : ''
      }`}
    >
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate font-ops-body text-ops-sm font-semibold text-ops-ink">{recipe.title}</span>
        <span className="truncate font-ops-body text-ops-xs text-ops-muted">{recipe.subtitle}</span>
      </span>
      <span className="text-center font-ops-mono text-ops-xs text-ops-strong">{recipe.durationText}</span>
      <span className="justify-self-center">
        <Badge tone={langs.tone}>{langs.label}</Badge>
      </span>
      <span className="justify-self-end">
        <Badge tone={status.tone}>{status.label}</Badge>
      </span>
    </Link>
  );
}

/** Seçili tarifin künyesi — okumak için; değiştirmek diyalogda. */
function RecipePreview({
  recipe,
  busy,
  onEdit,
  onTogglePublish,
}: {
  recipe: RecipeView;
  busy: boolean;
  onEdit: () => void;
  onTogglePublish: () => void;
}) {
  const status = statusBadge(recipe);
  return (
    <div className="flex flex-col gap-3.5 px-5 py-4">
      <div className="flex flex-col gap-1">
        <span className="font-ops-display text-ops-lg font-semibold text-ops-ink">{recipe.title}</span>
        <span className="font-ops-body text-ops-xs text-ops-muted">slug: /tarifler/{recipe.slug}</span>
        <span className="mt-0.5 flex flex-wrap gap-1.5">
          <Badge tone={status.tone}>{status.label}</Badge>
          {recipe.subtitle ? <Badge tone="slate">{recipe.subtitle}</Badge> : null}
        </span>
      </div>

      {recipe.descriptionText ? (
        <p className="font-ops-body text-ops-xs leading-[1.55] text-ops-body">{recipe.descriptionText}</p>
      ) : null}

      <Section title="Bağlı malzemeler — ürün kayıtları">
        {recipe.itemViews.length === 0 ? (
          <p className="font-ops-body text-ops-xs text-ops-muted">{RECIPE_NOTES.noItems}</p>
        ) : (
          recipe.itemViews.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2.5 rounded-ops-card border border-ops-line bg-ops-white px-3 py-2"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-px">
                <span className="truncate font-ops-body text-ops-xs font-semibold text-ops-ink">
                  {recipeItemTitle(item)}
                </span>
                <span className="font-ops-body text-ops-micro text-ops-muted">{num(item.qty)} adet</span>
              </span>
              {/* Fiyat TANIMSIZSA "—" — bedava değil, fiyatı girilmemiş demek (`CLAUDE §1`). */}
              <span className="font-ops-mono text-ops-xs text-ops-strong">
                {item.priceCents === null ? '—' : money(item.priceCents)}
              </span>
              {item.isAvailable ? null : <Badge tone="amber">tükendi</Badge>}
            </div>
          ))
        )}
      </Section>

      {recipe.pantryLines.length > 0 ? (
        <Section title="Evinizden — serbest metin">
          {recipe.pantryLines.map((line) => (
            <span key={line} className="font-ops-body text-ops-xs leading-[1.5] text-ops-body">
              • {line}
            </span>
          ))}
        </Section>
      ) : null}

      {recipe.stepLines.length > 0 ? (
        <Section title={`Hazırlanışı — ${num(recipe.stepLines.length)} adım`}>
          {recipe.stepLines.map((line, index) => (
            <div key={line} className="flex gap-2.5">
              {/* Numarayı EKRAN verir (05.16): metin yalnız satırları taşır, sayı görsel bir karar. */}
              <span className="grid size-5 flex-none place-items-center rounded-full bg-ops-gray-100 font-ops-display text-ops-micro font-semibold text-ops-body">
                {index + 1}
              </span>
              <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-body">{line}</span>
            </div>
          ))}
        </Section>
      ) : null}

      {/* Yayın kapısı GÖRÜNÜR: kısıt veritabanında ama operatör düğmenin neden kapalı olduğunu
          burada okumalı, yoksa kısıt ona anlaşılmaz bir hata olarak döner. */}
      <p
        className={`rounded-ops-card border px-3 py-2.5 font-ops-body text-ops-xs leading-[1.5] ${
          recipe.canPublish
            ? 'border-ops-olive-line bg-ops-olive-bg text-ops-olive-dark'
            : 'border-ops-amber-line bg-ops-amber-bg text-ops-amber-dark'
        }`}
      >
        {RECIPE_NOTES.publishGate(recipe)}
      </p>

      <div className="flex gap-2 border-t border-ops-line pt-3">
        {/* Yayın düğmesi kapalıysa SEBEBİ üstteki kutuda yazılı — düğmeyi gizlemek, operatöre
            "böyle bir şey yok" derdi; kapalı ama görünür olması "henüz değil" diyor. */}
        <Button
          variant="secondary"
          className="flex-1"
          disabled={busy || (!recipe.isActive && !recipe.canPublish)}
          onClick={onTogglePublish}
        >
          {recipe.isActive ? 'Taslağa çek' : 'Yayına al'}
        </Button>
        <Button variant="primary" className="flex-1" onClick={onEdit}>
          Düzenle
        </Button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.1em] text-ops-muted">
        {title}
      </span>
      {children}
    </div>
  );
}
