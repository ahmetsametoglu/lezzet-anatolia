import { MoneyMovementService, serviceDb } from '@lezzet/database';
import { listOpenDocuments } from '@lezzet/application';
import { NoAccessPane } from '@/components/operation/ui/no-access-pane';
import { guarded, requireFinance } from '@/lib/guard';
import { FinanceClient } from './finance-client';
import { namesOf, readDictionaries, readDocumentsPage, readLedgerPage, withResolvedAccount } from './finance-data';
import { toAccountViews, totalBalance } from './finance-read';
import type { FinanceData } from './finance-types';
import { parseFinanceUrl } from './finance-url';

// Para ekranı yönetime ve muhasebeye açıktır (`requireFinance`); görünmeyen sekmenin listesi okunmaz, devamı aynı okumayı çağıran
// action'larla gelir (`finance-data.ts`). İzah sayacı ham `money_movement`tan sayar, çünkü defter görünümü transferi iki satır yapar.

interface FinancePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function FinancePage({ searchParams }: FinancePageProps) {
  const access = await guarded(requireFinance);
  if (!access.ok) {
    return (
      <NoAccessPane
        title="Para"
        reason="Hesaplar, para hareketleri ve banka eşleştirmesi yönetim ve muhasebeye açıktır."
      />
    );
  }

  const db = serviceDb();
  const dictionaries = await readDictionaries(db);
  const urlState = withResolvedAccount(parseFinanceUrl(await searchParams), dictionaries.accounts);
  const names = namesOf(dictionaries);
  const accountViews = toAccountViews(dictionaries.accounts, dictionaries.balances);
  const onDocuments = urlState.tab === 'documents';

  const [ledger, documents, unexplainedCount, openDocuments] = await Promise.all([
    onDocuments ? Promise.resolve(null) : readLedgerPage(db, urlState, names),
    onDocuments ? readDocumentsPage(db, urlState, names) : Promise.resolve(null),
    // Sayaç SÜZGEÇTEN BAĞIMSIZ ve hesap-üstü: rozet "toplam ne kadar iş bekliyor" diyor.
    new MoneyMovementService(db).unexplainedCount(),
    // Açık belgeler doğal tavanlı (kapanan düşer) — sekmenin rozeti için tek turda.
    listOpenDocuments(db),
  ]);

  const { natures, tags, counterparties, suppliers } = dictionaries;
  const data: FinanceData = {
    accounts: accountViews,
    totalCents: totalBalance(accountViews),
    ledger,
    documents,
    openDocumentCount: openDocuments.length,
    unexplainedCount,
    natureOptions: natures.filter((nature) => nature.isActive).map((nature) => ({ value: nature.slug, label: nature.label, direction: nature.direction })),
    tagOptions: tags.filter((tag) => tag.isActive).map((tag) => ({ value: tag.slug, label: tag.label })),
    counterpartyOptions: counterparties
      .filter((counterparty) => counterparty.isActive)
      .map((counterparty) => ({
        value: counterparty.id,
        label: counterparty.name,
        defaultNature: counterparty.defaultNature,
        defaultBusiness: counterparty.defaultBusiness,
      })),
    // Ülke, vade ve varsayılan iş de taşınır: belge formu faturanın KDV rejimini, vadesini ve işini bunlardan önerir.
    supplierOptions: suppliers
      .filter((supplier) => supplier.isActive)
      .map((supplier) => ({
        value: supplier.id,
        label: supplier.name,
        country: supplier.country,
        paymentTermDays: supplier.paymentTermDays,
        defaultBusiness: supplier.defaultBusiness,
      })),
    dictionary: {
      natures: natures.map(({ slug, label, direction, accountCode, isActive }) => ({ slug, label, direction, accountCode, isActive })),
      counterparties: counterparties.map(({ id, name, kind, keywords, defaultNature, defaultBusiness, isActive }) => ({
        id,
        name,
        kind,
        keywords,
        defaultNature,
        defaultBusiness,
        isActive,
      })),
      tags: tags.map(({ slug, label, isActive }) => ({ slug, label, isActive })),
    },
  };

  return (
    <FinanceClient
      data={data}
      urlState={urlState}
      // Pasif hesap listede kalır ama yeni harekete kapanır, bu yüzden diyalogların seçicisi ayrı bir küme okur.
      writableAccounts={accountViews.filter((account) => account.isActive)}
    />
  );
}
