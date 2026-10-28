CREATE TABLE IF NOT EXISTS clients (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  identity_key TEXT NOT NULL UNIQUE,
  company_key TEXT NOT NULL,
  company TEXT NOT NULL,
  cif TEXT,
  address TEXT,
  postal_code TEXT,
  city TEXT,
  country TEXT,
  commercial TEXT,
  status TEXT NOT NULL DEFAULT 'Activo'
    CHECK (status IN ('Activo', 'Inactivo')),
  registered_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS clients_company_idx ON clients (company);
CREATE INDEX IF NOT EXISTS clients_company_key_idx ON clients (company_key);
CREATE INDEX IF NOT EXISTS clients_status_idx ON clients (status);

CREATE TABLE IF NOT EXISTS contacts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS contacts_email_per_client_idx
  ON contacts (client_id, LOWER(email))
  WHERE email IS NOT NULL AND email <> '';

CREATE TABLE IF NOT EXISTS invoices (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL UNIQUE,
  invoice_date DATE NOT NULL,
  taxable_base NUMERIC(12, 2) NOT NULL CHECK (taxable_base >= 0),
  vat_rate NUMERIC(5, 2) NOT NULL CHECK (vat_rate >= 0 AND vat_rate <= 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS invoices_client_date_idx
  ON invoices (client_id, invoice_date DESC);

CREATE TABLE IF NOT EXISTS client_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id BIGINT,
  client_name TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('cliente', 'contacto')),
  entity_id BIGINT,
  field TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  changed_by TEXT NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS client_history_client_date_idx
  ON client_history (client_id, changed_at DESC);