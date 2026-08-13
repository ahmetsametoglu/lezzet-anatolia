'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LocalizedText } from '@lezzet/types';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { TrashIcon } from '@/components/operation/ui/icons';
import { SortableList } from '@/components/operation/ui/sortable-list';
import { Thumbnail } from '@/components/operation/ui/thumbnail';
import { Combobox } from '@/components/operation/form/combobox';
import { Input } from '@/components/operation/form/input';
import { LocalizedTextField } from '@/components/operation/form/localized-text-field';
import {
  addFamilyMemberAction,
  createFamilyAction,
  removeFamilyMemberAction,
  renameFamilyAction,
  reorderFamilyAction,
  searchFamilyCandidatesAction,
  setMemberLabelAction,
} from './actions';
import type { FamilyView } from '../../products-types';

// **Aile diyaloğu** — ailenin kurulduğu, adlandırıldığı, üyelerinin eklendiği ve SIRALANDIĞI yer.
//
// Sıra burada, tek bir üyenin ürün diyaloğunda değil: sıra ailenin bütününe ait bir karardır ve
// üyeden verilseydi o diyalog kardeşlerinin listesiyle şişer, aynı karar iki yerden verilebilir
// olurdu (kullanıcı kararı 04.08).
//
// **Yeni aile ile var olan aile aynı pencere, iki hâl:** ad kaydedilmeden üye eklenemez, çünkü üye
// bir aileye bağlanır ve daha ortada aile yoktur. Ayrı pencere yazmak, ad alanını ve kaydetme
// akışını iki kez yazmak olurdu.

interface FamilyDialogProps {
  family: FamilyView | null;
  onClose: () => void;
}

const EMPTY_LABEL: LocalizedText = { tr: '', fr: '', de: '' };

export function FamilyDialog({ family, onClose }: FamilyDialogProps) {
  const router = useRouter();
  const [name, setName] = useState(family?.name ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Yeni üye kurgusu: hangi ürün + aile içi etiketi. İkisi BİRLİKTE sorulur çünkü etiket veri
  // kısıtıyla zorunlu (`family_id` doluyken boş olamaz) — ürünü ekleyip etiketi sonraya bırakmak
  // yazımı reddettirirdi.
  const [pick, setPick] = useState('');
  const [label, setLabel] = useState<LocalizedText>(EMPTY_LABEL);
  const [options, setOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [searching, setSearching] = useState(false);
  /** Etiketi düzenlenen üye — `null` hiçbiri. Satırın altında açılır, ayrı pencere açmaz. */
  const [editing, setEditing] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState<LocalizedText>(EMPTY_LABEL);

  const run = async (task: () => Promise<{ error: string | null }>) => {
    setError(null);
    setBusy(true);
    const { error: actionError } = await task();
    setBusy(false);
    if (actionError) {
      setError(actionError);
      return false;
    }
    router.refresh();
    return true;
  };

  const onSearch = (term: string) => {
    setSearching(true);
    void searchFamilyCandidatesAction(term).then((result) => {
      setOptions(result.data ?? []);
      setSearching(false);
    });
  };

  const saveName = async () => {
    if (family) return run(() => renameFamilyAction(family.id, name));
    const ok = await run(async () => {
      const { error: createError } = await createFamilyAction(name);
      return { error: createError };
    });
    // Yeni aile kurulduktan sonra pencere kapanır: üye eklemek için aile listeden yeniden açılır.
    // Aynı pencerede devam etmek, kurulan ailenin kimliğini istemcide taşımayı gerektirirdi.
    if (ok) onClose();
  };

  const addMember = async () => {
    if (!family || !pick) return;
    const ok = await run(() => addFamilyMemberAction(family.id, pick, label));
    if (ok) {
      setPick('');
      setLabel(EMPTY_LABEL);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={family ? family.name : 'Yeni aile'}
      subtitle="Aynı ürünün çeşitleri — müşteri bir çeşidin sayfasındayken ötekileri kartlarla görür"
      maxWidth={680}
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <label htmlFor="family-name" className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.1em] text-ops-muted">
              Aile adı
            </label>
            {/* TEK DİLLİ ve bu bilinçli: aile adı müşteriye görünmez, yalnız operatörün panelde
                aileyi tanımasına yarar — operasyon yüzeyi zaten tek dillidir (CLAUDE §2). Müşterinin
                gördüğü başlık arayüz metnidir ("Çeşitler"). */}
            <Input
              id="family-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Limonlu kek ailesi"
            />
          </div>
          <Button onClick={() => void saveName()} disabled={busy || name.trim().length === 0}>
            {family ? 'Adı kaydet' : 'Aileyi kur'}
          </Button>
        </div>

        {error ? <p className="font-ops-body text-ops-xs text-ops-red">{error}</p> : null}

        {family ? (
          <>
            <section className="flex flex-col gap-2">
              <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.1em] text-ops-muted">
                Üyeler ({family.members.length})
              </span>

              {family.members.length === 0 ? (
                <p className="rounded-ops-card border border-dashed border-ops-line-strong px-3.5 py-4 text-center font-ops-body text-ops-sm text-ops-muted">
                  Henüz üye yok — aşağıdan ürün ekleyin.
                </p>
              ) : (
                // Sıra SÜRÜKLENİR ve yazma TÜM AİLEYİ birden değiştirir (şemanın kuralı): kısmi
                // güncelleme iki eşzamanlı sürüklemede sıralamada delik bırakır ve hiçbir yer hata
                // vermezdi — kartlar bir gün kendiliğinden başka sırada görünürdü.
                <SortableList
                  items={family.members}
                  getId={(member) => member.productId}
                  onReorder={(ids) => void run(() => reorderFamilyAction(ids))}
                  renderItem={(member, handle) => (
                    <div className="flex items-center gap-3 rounded-ops-card border border-ops-line bg-ops-surface px-3 py-2">
                      {handle}
                      <Thumbnail src={member.imageUrl} alt={member.productName} size={32} />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate font-ops-body text-ops-sm text-ops-ink">
                          {member.label.tr || member.productName}
                        </span>
                        <span className="truncate font-ops-body text-ops-micro text-ops-faint">{member.productName}</span>
                      </div>
                      {member.status !== 'active' ? (
                        <Badge tone="slate" outline>
                          {member.status === 'candidate' ? 'aday' : 'pasif'}
                        </Badge>
                      ) : null}
                      {/* Etiket SONRADAN düzenlenebilir: ikinci çeşit eklenince ilkinin adı çoğu
                          zaman yeniden düşünülüyor ("Klasik" ancak yanına "Limonlu" gelince anlam
                          kazanıyor). Satırın içinde açılıyor — her üye için pencere açmak, dört
                          çeşitli bir aileyi düzenlemeyi sekiz tıklamaya çevirirdi. */}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setEditing(editing === member.productId ? null : member.productId);
                          setEditLabel(member.label);
                        }}
                        title="Aile içi etiketi düzenle"
                        className="cursor-pointer rounded-ops-btn px-2 py-1 font-ops-display text-ops-xs font-semibold text-ops-muted transition-colors hover:bg-ops-surface-sunken hover:text-ops-ink"
                      >
                        Etiket
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void run(() => removeFamilyMemberAction(family.id, member.productId))}
                        title="Aileden çıkar — ürün silinmez"
                        className="cursor-pointer rounded-ops-btn p-1.5 text-ops-faint transition-colors hover:bg-ops-red-bg hover:text-ops-red"
                      >
                        <TrashIcon />
                      </button>
                    </div>
                  )}
                />
              )}

              {editing ? (
                <div className="flex flex-col gap-2 rounded-ops-card border border-ops-olive-line bg-ops-olive-bg p-3">
                  <LocalizedTextField
                    label="Aile içi etiket"
                    value={editLabel}
                    onChange={setEditLabel}
                    required
                    maxLength={40}
                    field="ad"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={async () => {
                        const ok = await run(() => setMemberLabelAction(editing, editLabel));
                        if (ok) setEditing(null);
                      }}
                    >
                      Etiketi kaydet
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setEditing(null)}>
                      Vazgeç
                    </Button>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="flex flex-col gap-3 rounded-ops-card border border-ops-line bg-ops-surface-sunken p-3.5">
              <span className="font-ops-display text-ops-micro font-semibold uppercase tracking-[0.1em] text-ops-muted">
                Üye ekle
              </span>

              {/* Seçici UZAK kipte ve **zaten ailesi olanlar elenir**: bir ürün en çok bir ailede
                  olabilir (`family_id` kolonu). Elenmeselerdi operatör ürünü ikinci aileye ekler,
                  ürün sessizce birincisinden düşerdi. */}
              <Combobox
                value={pick}
                onChange={setPick}
                options={options.map((option) => ({ value: option.id, label: option.name }))}
                selectedLabel={options.find((option) => option.id === pick)?.name}
                onSearch={onSearch}
                loading={searching}
                placeholder="Ürün seç"
                searchPlaceholder="Ürün adı yazın…"
                emptyText="Eşleşen ürün yok — ya adı farklı ya da ürün başka bir ailede."
              />

              {/* Etiket ÜÇ DİLLİ ve AI çevirisi bağlı: kartta okunan budur ("Limonlu"), ürün adı
                  değil ("Limonlu kek") — kartlar yan yana dururken her birinde "kek" kelimesini
                  tekrar etmek seçimi zorlaştırır. */}
              <LocalizedTextField
                label="Aile içi etiket"
                value={label}
                onChange={setLabel}
                required
                maxLength={40}
                placeholder={(lang) => (lang === 'tr' ? 'Limonlu' : lang === 'fr' ? 'Citron' : 'Zitrone')}
                hint="Kartta okunan ad. Ürün adını tekrar etmeyin — “Limonlu kek” değil, “Limonlu”."
                field="ad"
              />

              <Button
                variant="secondary"
                onClick={() => void addMember()}
                disabled={busy || !pick || !(label.tr?.trim() || label.fr?.trim() || label.de?.trim())}
              >
                Aileye ekle
              </Button>
            </section>
          </>
        ) : (
          <p className="font-ops-body text-ops-sm text-ops-muted">
            Önce aileyi kurun; üyeler kurulduktan sonra eklenir.
          </p>
        )}
      </div>
    </Dialog>
  );
}
