import { pgTable, serial, varchar, integer, timestamp, doublePrecision, date, boolean, index } from 'drizzle-orm/pg-core';

export const plans = pgTable('plans', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  rateMonthly: doublePrecision('rate_monthly').notNull(),
  rateYearly: doublePrecision('rate_yearly').notNull(),
  maxUsers: integer('max_users').notNull(),
  yearlyDiscountPercent: doublePrecision('yearly_discount_percent').notNull().default(0),
});

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).unique().notNull(),
  mobile: varchar('mobile', { length: 20 }).unique().notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: varchar('role', { length: 20 }).notNull().default('user'),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  planId: integer('plan_id').references(() => plans.id),
  trxId: varchar('trx_id', { length: 100 }),
  adminId: integer('admin_id'), // For sub-users created by Admin
  expDate: timestamp('exp_date'),
  createdAt: timestamp('created_at').defaultNow(),
  lastActive: timestamp('last_active'),
  lastPage: varchar('last_page', { length: 255 }),
}, (table) => ({
  emailIdx: index('users_email_idx').on(table.email),
  adminIdIdx: index('users_admin_id_idx').on(table.adminId),
}));

export const clients = pgTable('clients', {
  id: serial('id').primaryKey(),
  adminId: integer('admin_id').references(() => users.id).notNull().default(1),
  name: varchar('name', { length: 255 }).notNull(),
  bin: varchar('bin', { length: 50 }),
}, (table) => ({
  adminIdIdx: index('clients_admin_id_idx').on(table.adminId),
  nameIdx: index('clients_name_idx').on(table.name),
  binIdx: index('clients_bin_idx').on(table.bin),
}));

export const items = pgTable('items', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  hsCode: varchar('hs_code', { length: 50 }),
  awHsCode: varchar('aw_hs_code', { length: 50 }),
}, (table) => ({
  nameIdx: index('items_name_idx').on(table.name),
  hsCodeIdx: index('items_hs_code_idx').on(table.hsCode),
}));

export const purchases = pgTable('purchases', {
  id: serial('id').primaryKey(),
  adminId: integer('admin_id').references(() => users.id).notNull().default(1),
  clientId: integer('client_id').references(() => clients.id).notNull(),
  itemId: integer('item_id').references(() => items.id).notNull(),
  office: varchar('office', { length: 50 }),
  beNo: varchar('be_no', { length: 100 }),
  beDate: date('be_date').notNull(),
  month: varchar('month', { length: 7 }).notNull(),
  lcNumber: varchar('lc_number', { length: 100 }),
  netWt: doublePrecision('net_wt').notNull(),
  excessQty: doublePrecision('excess_qty'),
  totalQty: doublePrecision('total_qty'),
  assValue: doublePrecision('ass_value').notNull(),
  unitValue: doublePrecision('unit_value'),
  cd: doublePrecision('cd'),
  rd: doublePrecision('rd'),
  sd: doublePrecision('sd'),
  baseValueOfVat: doublePrecision('base_value_of_vat'),
  vat: doublePrecision('vat'),
  at: doublePrecision('at'),
  isRebate: boolean('is_rebate').default(false),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => ({
  adminIdIdx: index('purchases_admin_id_idx').on(table.adminId),
  clientIdIdx: index('purchases_client_id_idx').on(table.clientId),
  monthIdx: index('purchases_month_idx').on(table.month),
}));

export const salesRates = pgTable('sales_rates', {
  id: serial('id').primaryKey(),
  adminId: integer('admin_id').references(() => users.id).notNull().default(1),
  clientId: integer('client_id').references(() => clients.id).notNull(),
  itemId: integer('item_id').references(() => items.id).notNull(),
  unitId: integer('unit_id').references(() => unitConversions.id),
  salesRate: doublePrecision('sales_rate').notNull(),
  vatRate: doublePrecision('vat_rate').notNull(),
  vatableValue: doublePrecision('vatable_value').notNull(),
  additionPercent: doublePrecision('addition_percent').default(0),
  activationDate: date('activation_date').notNull(),
  isFfs: boolean('is_ffs').default(false),
  status: varchar('status', { length: 20 }).default('Active'),
}, (table) => ({
  adminIdIdx: index('sales_rates_admin_id_idx').on(table.adminId),
  clientIdIdx: index('sales_rates_client_id_idx').on(table.clientId),
}));

export const columnMappings = pgTable('column_mappings', {
  id: serial('id').primaryKey(),
  dbColumn: varchar('db_column', { length: 100 }).notNull().unique(),
  excelHeader: varchar('excel_header', { length: 255 }).notNull(),
});

export const vatNotesMapping = pgTable('vat_notes_mapping', {
  id: serial('id').primaryKey(),
  vatRate: doublePrecision('vat_rate').notNull(),
  noteName: varchar('note_name', { length: 50 }).notNull(),
});

export const unitConversions = pgTable('unit_conversions', {
  id: serial('id').primaryKey(),
  purchaseUnit: varchar('purchase_unit', { length: 50 }).notNull(),
  salesUnit: varchar('sales_unit', { length: 50 }).notNull(),
  factor: doublePrecision('factor').notNull(),
});

export const otps = pgTable('otps', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  otpCode: varchar('otp_code', { length: 10 }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  isUsed: boolean('is_used').default(false),
});

export const clientCredentials = pgTable('client_credentials', {
  id: serial('id').primaryKey(),
  adminId: integer('admin_id').references(() => users.id).notNull(),
  clientId: integer('client_id').references(() => clients.id).notNull(),
  loginId: varchar('login_id', { length: 255 }).notNull(),
  loginPassword: varchar('login_password', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  message: varchar('message', { length: 500 }).notNull(),
  clientId: integer('client_id').references(() => clients.id).notNull(),
  oldAdminId: integer('old_admin_id').references(() => users.id).notNull(),
  newAdminId: integer('new_admin_id').references(() => users.id).notNull(),
  isRead: boolean('is_read').default(false),
  createdAt: timestamp('created_at').defaultNow(),
});
