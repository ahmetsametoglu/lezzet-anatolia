import { MoneyMovementService, serviceDb } from '@lezzet/database';
import { listOpenDocuments } from '@lezzet/application';
import { NoAccessPane } from '@/components/operation/ui/no-access-pane';
import { guarded, requireFinance } from '@/lib/guard';
import { FinanceClient } from './finance-client';
import { namesOf, readDictionaries, readDocumentsPage, readLedgerPage, withResolvedAccount } from './finance-data';
import { toAccountViews, totalBalance } from './finance-read';
import type { FinanceData } from './finance-types';
import { parseFinanceUrl } from './finance-url';

// Para (12) — **yönetici VEYA muhasebeci** (`requireFinance`). Tasarım §1: paranın tek mantıkla
// izlendiği yer — para bir hesapta durur, hareketlerle girer/çıkar.
//
// ── İKİ LİSTE, YALNIZ GÖRÜNEN OKUNUR (12.17) ─────────────────────────────────
// "Hareketler | Belgeler" sekmesi adreste; görünmeyen sekmenin listesi okunmaz. İlk sayfa burada,
// devamı "devamını yükle" action'larıyla — ikisi de aynı okumayı çağırır (`finance-data.ts`).
//
// ── KUYRUK YOK, ÖNERİ SATIRDA (12.19) ──────────────────────────────────────
// Banka eşleştirme kuyruğunun kartları kalktı (kullanıcı kararı "tek liste + tek panel"): mutabık
// olmayan ekstre satırının önerisi satırın kendisiyle okunur (`finance-data.ts`), onay satırın panelinde.
//
// ── SAYAÇ SÜZGEÇTEN BAĞIMSIZ ────────────────────────────────────────────────
// `unexplainedCount()` ham `money_movement`tan sayar, defter görünümünden değil: görünüm transferi
// iki satır üretiyor ve bir hareket iki kez sayılırdı. Sayılan şey İZAH (13.09): bağı, belge bağı,
// türü ya da karşı hesabı olmayan hareket. Belgeler sekmesinin rozeti AÇIK belge sayısıdır.
//
// ── SÖZLÜKLER TEK TURDA (13.09 · ikinci karar) ──────────────────────────────
// Tür, cari, etiket ve tedarikçi listeleri doğal tavanlı (operatörün kurduğu kümeler); satırların
// adları ve seçicilerin seçenekleri aynı okumadan kurulur.

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
      .map((counterparty) => ({ value: counterparty.id, label: counterparty.name, defaultNature: counterparty.defaultNature })),
    supplierOptions: suppliers.filter((supplier) => supplier.isActive).map((supplier) => ({ value: supplier.id, label: supplier.name })),
    dictionary: {
      natures: natures.map(({ slug, label, direction, accountCode, isActive }) => ({ slug, label, direction, accountCode, isActive })),
      counterparties: counterparties.map(({ id, name, kind, keywords, defaultNature, isActive }) => ({ id, name, kind, keywords, defaultNature, isActive })),
      tags: tags.map(({ slug, label, isActive }) => ({ slug, label, isActive })),
    },
  };

  return (
    <FinanceClient
      data={data}
      urlState={urlState}
      // Pasif hesap listede kalır (geçmişi ona bağlı) ama YENİ harekete kapanır — diyalogların
      // seçicisi bu yüzden ayrı bir küme okur, hesap şeridiyle aynı diziyi değil.
      writableAccounts={accountViews.filter((account) => account.isActive)}
    />
  );
}
