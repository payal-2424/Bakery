-- ============================================================
-- SWEET CRUMBS SaaS - Complete Database Schema
-- Run this in Supabase SQL editor
-- ============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TENANTS (each bakery is a tenant)
-- ============================================================
CREATE TABLE tenants (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(200) NOT NULL,
  slug          VARCHAR(100) UNIQUE NOT NULL,       -- used in URLs
  phone         VARCHAR(20),
  email         VARCHAR(200),
  address       TEXT,
  city          VARCHAR(100),
  state         VARCHAR(100),
  pincode       VARCHAR(10),
  gstin         VARCHAR(20),
  logo_url      TEXT,
  timezone      VARCHAR(50) DEFAULT 'Asia/Kolkata',
  currency      VARCHAR(5)  DEFAULT 'INR',
  plan          VARCHAR(20) DEFAULT 'free',         -- free | starter | pro
  plan_expires_at TIMESTAMPTZ,
  is_active     BOOLEAN DEFAULT TRUE,
  settings      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            VARCHAR(200) NOT NULL,
  email           VARCHAR(200),
  phone           VARCHAR(20) NOT NULL,
  password_hash   TEXT,
  role            VARCHAR(20) NOT NULL DEFAULT 'staff',  -- owner | manager | staff
  is_active       BOOLEAN DEFAULT TRUE,
  last_login_at   TIMESTAMPTZ,
  otp_code        VARCHAR(10),
  otp_expires_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(phone, tenant_id)
);

-- Refresh tokens
CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CUSTOMERS (per tenant)
-- ============================================================
CREATE TABLE customers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            VARCHAR(200) NOT NULL,
  phone           VARCHAR(20) NOT NULL,
  email           VARCHAR(200),
  address         TEXT,
  birthday        DATE,
  anniversary     DATE,
  loyalty_points  INTEGER DEFAULT 0,
  total_orders    INTEGER DEFAULT 0,
  total_spent     NUMERIC(12,2) DEFAULT 0,
  tags            TEXT[] DEFAULT '{}',
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(phone, tenant_id)
);

-- ============================================================
-- INVENTORY / PRODUCTS
-- ============================================================
CREATE TABLE inventory_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name            VARCHAR(200) NOT NULL,
  category        VARCHAR(100),
  unit            VARCHAR(20) DEFAULT 'pcs',
  qty             NUMERIC(10,2) DEFAULT 0,
  reorder_at      NUMERIC(10,2) DEFAULT 0,
  cost_price      NUMERIC(10,2) DEFAULT 0,
  sell_price      NUMERIC(10,2) DEFAULT 0,
  sku             VARCHAR(100),
  barcode         VARCHAR(100),
  description     TEXT,
  image_url       TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  track_inventory BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Stock movements (audit trail)
CREATE TABLE stock_movements (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  item_id       UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  type          VARCHAR(20) NOT NULL,   -- in | out | adjustment
  qty           NUMERIC(10,2) NOT NULL,
  qty_before    NUMERIC(10,2) NOT NULL,
  qty_after     NUMERIC(10,2) NOT NULL,
  reference     VARCHAR(100),          -- order ID or manual
  notes         TEXT,
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ORDERS
-- ============================================================
CREATE TABLE orders (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_number    VARCHAR(20) NOT NULL,
  customer_id     UUID REFERENCES customers(id),
  customer_name   VARCHAR(200),
  customer_phone  VARCHAR(20),
  status          VARCHAR(20) DEFAULT 'new',
  -- new | confirmed | preparing | ready | delivered | completed | cancelled
  source          VARCHAR(20) DEFAULT 'manual',
  -- manual | whatsapp | phone | walk_in
  delivery_type   VARCHAR(20) DEFAULT 'pickup',  -- pickup | delivery
  delivery_address TEXT,
  pickup_date     DATE,
  pickup_time     TIME,
  subtotal        NUMERIC(12,2) DEFAULT 0,
  discount        NUMERIC(12,2) DEFAULT 0,
  tax_amount      NUMERIC(12,2) DEFAULT 0,
  total_amount    NUMERIC(12,2) DEFAULT 0,
  amount_paid     NUMERIC(12,2) DEFAULT 0,
  payment_method  VARCHAR(20),   -- cash | upi | card | credit
  payment_status  VARCHAR(20) DEFAULT 'pending',  -- pending | partial | paid
  notes           TEXT,
  cancellation_reason TEXT,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(order_number, tenant_id)
);

-- Order items
CREATE TABLE order_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  item_id         UUID REFERENCES inventory_items(id),
  item_name       VARCHAR(200) NOT NULL,
  qty             NUMERIC(10,2) NOT NULL,
  unit_price      NUMERIC(10,2) NOT NULL,
  discount        NUMERIC(10,2) DEFAULT 0,
  total_price     NUMERIC(10,2) NOT NULL,
  customization   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Order status history
CREATE TABLE order_status_history (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status      VARCHAR(20) NOT NULL,
  notes       TEXT,
  changed_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SALES REGISTER
-- ============================================================
CREATE TABLE sales_entries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  item_id         UUID REFERENCES inventory_items(id),
  item_name       VARCHAR(200) NOT NULL,
  qty             NUMERIC(10,2) NOT NULL,
  unit_price      NUMERIC(10,2) NOT NULL,
  total_amount    NUMERIC(12,2) NOT NULL,
  payment_method  VARCHAR(20) NOT NULL DEFAULT 'cash',  -- cash | upi | card
  order_id        UUID REFERENCES orders(id),
  customer_id     UUID REFERENCES customers(id),
  sale_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  notes           TEXT,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- GST INVOICES
-- ============================================================
CREATE TABLE invoices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  invoice_number  VARCHAR(50) NOT NULL,
  order_id        UUID REFERENCES orders(id),
  customer_id     UUID REFERENCES customers(id),
  customer_name   VARCHAR(200),
  customer_phone  VARCHAR(20),
  customer_gstin  VARCHAR(20),
  customer_address TEXT,
  subtotal        NUMERIC(12,2) NOT NULL,
  cgst_rate       NUMERIC(5,2) DEFAULT 2.5,
  sgst_rate       NUMERIC(5,2) DEFAULT 2.5,
  cgst_amount     NUMERIC(12,2) DEFAULT 0,
  sgst_amount     NUMERIC(12,2) DEFAULT 0,
  igst_rate       NUMERIC(5,2) DEFAULT 0,
  igst_amount     NUMERIC(12,2) DEFAULT 0,
  discount        NUMERIC(12,2) DEFAULT 0,
  total_amount    NUMERIC(12,2) NOT NULL,
  payment_status  VARCHAR(20) DEFAULT 'paid',
  invoice_date    DATE DEFAULT CURRENT_DATE,
  due_date        DATE,
  pdf_url         TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(invoice_number, tenant_id)
);

CREATE TABLE invoice_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id  UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  item_name   VARCHAR(200) NOT NULL,
  hsn_code    VARCHAR(20),
  qty         NUMERIC(10,2) NOT NULL,
  unit_price  NUMERIC(10,2) NOT NULL,
  discount    NUMERIC(10,2) DEFAULT 0,
  tax_rate    NUMERIC(5,2) DEFAULT 5,
  tax_amount  NUMERIC(10,2) DEFAULT 0,
  total_price NUMERIC(10,2) NOT NULL
);

-- ============================================================
-- WHATSAPP INTEGRATION
-- ============================================================
CREATE TABLE whatsapp_config (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,
  phone_number_id   VARCHAR(100),
  business_account_id VARCHAR(100),
  access_token      TEXT,
  webhook_verify_token TEXT,
  is_active         BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE whatsapp_messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  wa_message_id   VARCHAR(200),
  direction       VARCHAR(10) NOT NULL,  -- inbound | outbound
  from_number     VARCHAR(20),
  to_number       VARCHAR(20),
  message_type    VARCHAR(20),           -- text | interactive | template
  content         JSONB,
  status          VARCHAR(20) DEFAULT 'sent',
  order_id        UUID REFERENCES orders(id),
  customer_id     UUID REFERENCES customers(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE whatsapp_sessions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone       VARCHAR(20) NOT NULL,
  step        VARCHAR(50) DEFAULT 'idle',
  data        JSONB DEFAULT '{}',
  expires_at  TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 minutes',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(phone, tenant_id)
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id),
  type        VARCHAR(50) NOT NULL,   -- low_stock | new_order | birthday etc.
  title       VARCHAR(200) NOT NULL,
  body        TEXT,
  data        JSONB DEFAULT '{}',
  is_read     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- AUDIT LOGS
-- ============================================================
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES users(id),
  action      VARCHAR(100) NOT NULL,
  entity      VARCHAR(50),
  entity_id   UUID,
  old_data    JSONB,
  new_data    JSONB,
  ip_address  VARCHAR(45),
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================
CREATE INDEX idx_users_tenant       ON users(tenant_id);
CREATE INDEX idx_users_phone        ON users(phone);
CREATE INDEX idx_customers_tenant   ON customers(tenant_id);
CREATE INDEX idx_customers_phone    ON customers(phone, tenant_id);
CREATE INDEX idx_inventory_tenant   ON inventory_items(tenant_id);
CREATE INDEX idx_orders_tenant      ON orders(tenant_id);
CREATE INDEX idx_orders_status      ON orders(tenant_id, status);
CREATE INDEX idx_orders_date        ON orders(tenant_id, created_at DESC);
CREATE INDEX idx_orders_customer    ON orders(customer_id);
CREATE INDEX idx_order_items_order  ON order_items(order_id);
CREATE INDEX idx_sales_tenant_date  ON sales_entries(tenant_id, sale_date DESC);
CREATE INDEX idx_stock_item         ON stock_movements(item_id);
CREATE INDEX idx_audit_tenant       ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX idx_wa_messages_tenant ON whatsapp_messages(tenant_id, created_at DESC);

-- ============================================================
-- ROW LEVEL SECURITY (Supabase RLS)
-- ============================================================
ALTER TABLE tenants             ENABLE ROW LEVEL SECURITY;
ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders              ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_entries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices            ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications       ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages   ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS (used by our backend)
-- Frontend never touches DB directly

-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all relevant tables
DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'tenants','users','customers','inventory_items',
    'orders','invoices','whatsapp_config','whatsapp_sessions'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at
       BEFORE UPDATE ON %s
       FOR EACH ROW EXECUTE FUNCTION update_updated_at()',
      tbl, tbl
    );
  END LOOP;
END $$;

-- Generate order number: ORD-YYYYMMDD-XXXX
CREATE OR REPLACE FUNCTION generate_order_number(p_tenant_id UUID)
RETURNS TEXT AS $$
DECLARE
  today_str TEXT := TO_CHAR(NOW(), 'YYYYMMDD');
  seq       INT;
BEGIN
  SELECT COUNT(*) + 1
    INTO seq
    FROM orders
   WHERE tenant_id = p_tenant_id
     AND DATE(created_at) = CURRENT_DATE;
  RETURN 'ORD-' || today_str || '-' || LPAD(seq::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- Generate invoice number
CREATE OR REPLACE FUNCTION generate_invoice_number(p_tenant_id UUID)
RETURNS TEXT AS $$
DECLARE
  yr  TEXT := TO_CHAR(NOW(), 'YYYY');
  seq INT;
BEGIN
  SELECT COUNT(*) + 1
    INTO seq
    FROM invoices
   WHERE tenant_id = p_tenant_id
     AND EXTRACT(YEAR FROM invoice_date) = EXTRACT(YEAR FROM NOW());
  RETURN 'INV-' || yr || '-' || LPAD(seq::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- SEED: Demo tenant + owner (password: demo1234)
-- ============================================================
INSERT INTO tenants(id, name, slug, phone, email, city, state, gstin, plan)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Sweet Crumbs Bakery',
  'sweet-crumbs',
  '9876543210',
  'owner@sweetcrumbs.in',
  'Roorkee',
  'Uttarakhand',
  '05ABCDE1234F1Z5',
  'pro'
);

INSERT INTO users(id, tenant_id, name, phone, email, password_hash, role)
VALUES (
  'b0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'Raj Sharma',
  '9876543210',
  'raj@sweetcrumbs.in',
  crypt('demo1234', gen_salt('bf')),
  'owner'
);
