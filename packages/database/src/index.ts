// @lezzet/database — Supabase erişimi (ORM yok, supabase-js). Yalnız types + helper bilir.
// Artımlı büyür: her modül kendi tablolarının servisini ekler. İçerik: docs/build/02-database.md
// Not: BaseDbService ve case-transformers paket-içi altyapıdır; dışa yalnız kamu API'si (istemci + servisler) verilir.

// İstemci
export { createServiceRoleClient, serviceDb, type Db } from './client';

// Servisler
export { CustomerService, type FindOrCreateResult } from './services/customer.service';
export { StaffRoleService } from './services/staff-role.service';
export { EmailVerificationService, type RequestCodeResult, type VerifyCodeResult } from './services/email-verification.service';
export { CategoryService, type CreateCategoryInput } from './services/category.service';
export { CollectionService, type CreateCollectionInput } from './services/collection.service';
export { ProductService, type CreateProductInput, type CreateVariantInput } from './services/product.service';
export { ProductVariantService } from './services/product-variant.service';
