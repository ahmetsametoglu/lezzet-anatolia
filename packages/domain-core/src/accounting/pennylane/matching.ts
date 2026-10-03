/**
 * Banka satırının Pennylane eşleşmesi, saf karar: eşleşme bizde kurulur ve Pennylane'e yazılır. Bizde olmayan faturaya kurulan
 * eşleşmeye dokunulmaz, çünkü aynı şirketin başka işinindir; o hareket bizde başka işe eşli sayılır.
 */

export type PennylaneMatchPlan =
  | { kind: 'none' }
  | { kind: 'add'; invoiceIds: number[] }
  | { kind: 'rewrite'; invoiceIds: number[] }
  | { kind: 'blocked'; reason: 'foreign_matches' };

/**
 * Pennylane'e yazımın planı küme olarak kurulur, çünkü Pennylane dağıtımı eşleme sırasına bağlamıyor; eksik faturalarımız eklenir.
 * Çıkan faturamız varsa bütün eşleşmeler çözülüp küme yeniden kurulur, çünkü tek bağı çözmek hepsini çözüyor; harekette başka işin
 * eşleşmesi de varsa onu yeniden kurmak o kaydı ezerdi, hareket bekler.
 */
export function pennylaneMatchPlan(input: {
  current: readonly number[];
  ours: ReadonlySet<number>;
  desired: readonly number[];
}): PennylaneMatchPlan {
  const current = new Set(input.current);
  const desired = new Set(input.desired);
  const missing = input.desired.filter((id) => !current.has(id));
  const leaving = input.current.filter((id) => input.ours.has(id) && !desired.has(id));
  if (leaving.length === 0) return missing.length === 0 ? { kind: 'none' } : { kind: 'add', invoiceIds: missing };
  if (input.current.some((id) => !input.ours.has(id))) return { kind: 'blocked', reason: 'foreign_matches' };
  return { kind: 'rewrite', invoiceIds: [...input.desired] };
}

/**
 * Pennylane'deki eşleşmelerin bizdeki karşılığı: bizim faturamıza Pennylane'de kurulan ama bizde olmayan bağ benimsenir; bizde duran
 * bağ Pennylane'de çözüldüyse silinmez, işaretlenir ve yeniden yazılmaz; Pennylane'de yeniden kurulursa işaret kalkar. Bizde olmayan
 * faturaya eşli hareket başka işe eşlidir.
 */
export function pennylaneMatchReading(input: {
  current: readonly number[];
  /** Pennylane faturası → bizim belgemiz, yalnız yüklediklerimiz. */
  ourDocuments: ReadonlyMap<number, string>;
  /** Hareketin yüklenmiş belgelere bağları; `removed`: Pennylane'de çözüldüğü işaretli. */
  allocations: ReadonlyArray<{ id: string; documentId: string; invoiceId: number; removed: boolean }>;
}): { adopt: string[]; removed: string[]; restored: string[]; elsewhere: boolean } {
  const current = new Set(input.current);
  const allocated = new Set(input.allocations.map((allocation) => allocation.documentId));
  return {
    adopt: input.current.flatMap((id) => {
      const documentId = input.ourDocuments.get(id);
      return documentId && !allocated.has(documentId) ? [documentId] : [];
    }),
    removed: input.allocations.filter((allocation) => !allocation.removed && !current.has(allocation.invoiceId)).map((a) => a.id),
    restored: input.allocations.filter((allocation) => allocation.removed && current.has(allocation.invoiceId)).map((a) => a.id),
    elsewhere: input.current.some((id) => !input.ourDocuments.has(id)),
  };
}
