'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RecipeDialog } from './recipe-dialog';
import { RecipesDesktop } from './recipes.desktop';
import { setRecipeActiveAction } from './recipes-actions';
import type { RecipeView, RecipesData } from './recipes-types';

/**
 * Tarif ekranının istemci kökü (09.21).
 *
 * **Diyalog adreste DEĞİL, seçim adreste.** Seçili tarif paylaşılabilir bir okumadır (`?r=<id>`);
 * açık bir form ise bir işlemin yarısıdır ve geri düğmesi yarım bir formu geri getirmemeli. Aynı
 * ayrım rota kurulumunda da yazılı.
 */
export function RecipesClient({ data, selectedId }: { data: RecipesData; selectedId: string | null }) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  /** `null` = kapalı · `{ recipe: null }` = yeni · `{ recipe }` = düzenleme. */
  const [editing, setEditing] = useState<{ recipe: RecipeView | null } | null>(null);

  const togglePublish = (recipe: RecipeView) => {
    setError(null);
    startTransition(async () => {
      const result = await setRecipeActiveAction(recipe.id, !recipe.isActive);
      // Kısıt ihlali burada okunur bir cümleye dönüyor (`recipe_active_needs_all_locales`);
      // ekran ayrıca kendi kontrolünü yapmıyor — kural iki yerde yazılmaz.
      if (result.error) setError(result.error);
      else router.refresh();
    });
  };

  return (
    <>
      <RecipesDesktop
        data={data}
        selectedId={selectedId}
        busy={busy}
        error={error}
        onCreate={() => setEditing({ recipe: null })}
        onEdit={(recipe) => setEditing({ recipe })}
        onTogglePublish={togglePublish}
      />
      {editing ? <RecipeDialog recipe={editing.recipe} onClose={() => setEditing(null)} /> : null}
    </>
  );
}
