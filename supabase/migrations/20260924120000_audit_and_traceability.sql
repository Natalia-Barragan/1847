-- =========================================================================
-- MIGRACIÓN: Auditoría y Trazabilidad de Usuarios en Fuego & Brasa
-- Registra quién opera cobros, turnos, anulaciones, facturas y pre-cuentas
-- =========================================================================

-- 1. Agregar columnas de auditoría a la tabla 'orders'
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS user_id TEXT,
  ADD COLUMN IF NOT EXISTS user_name TEXT,
  ADD COLUMN IF NOT EXISTS closed_by_user_id TEXT,
  ADD COLUMN IF NOT EXISTS closed_by_user_name TEXT,
  ADD COLUMN IF NOT EXISTS last_prebill_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_prebill_by_user_id TEXT,
  ADD COLUMN IF NOT EXISTS last_prebill_by_user_name TEXT;

-- 2. Agregar columnas de auditoría a la tabla 'invoices_arca'
ALTER TABLE invoices_arca
  ADD COLUMN IF NOT EXISTS user_id TEXT,
  ADD COLUMN IF NOT EXISTS user_name TEXT;

-- 3. Crear tabla: cash_register_shifts (Apertura, Arqueo y Cierre de Turnos de Caja)
CREATE TABLE IF NOT EXISTS cash_register_shifts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shift_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    opened_by_user_id TEXT NOT NULL,
    opened_by_user_name TEXT NOT NULL,
    initial_cash NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (initial_cash >= 0),
    closed_at TIMESTAMPTZ,
    closed_by_user_id TEXT,
    closed_by_user_name TEXT,
    final_cash_expected NUMERIC(10,2) DEFAULT 0.00,
    final_cash_real NUMERIC(10,2) DEFAULT 0.00,
    cash_difference NUMERIC(10,2) DEFAULT 0.00,
    total_orders_count INTEGER DEFAULT 0,
    total_sales_amount NUMERIC(10,2) DEFAULT 0.00,
    total_cash_amount NUMERIC(10,2) DEFAULT 0.00,
    total_debit_amount NUMERIC(10,2) DEFAULT 0.00,
    total_credit_amount NUMERIC(10,2) DEFAULT 0.00,
    total_qr_amount NUMERIC(10,2) DEFAULT 0.00,
    total_fiscal_net NUMERIC(10,2) DEFAULT 0.00,
    total_fiscal_vat NUMERIC(10,2) DEFAULT 0.00,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Modificar tabla 'order_items' para admitir anulaciones con trazabilidad
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by_user_id TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_by_user_name TEXT,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT;

-- 5. Crear tabla: order_item_cancellations (Historial detallado de ítems anulados)
CREATE TABLE IF NOT EXISTS order_item_cancellations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price NUMERIC(10,2) NOT NULL,
    reason TEXT NOT NULL,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Crear tabla: prebill_emissions (Historial de pre-cuentas emitidas)
CREATE TABLE IF NOT EXISTS prebill_emissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    table_id UUID REFERENCES tables(id) ON DELETE SET NULL,
    table_number TEXT,
    subtotal NUMERIC(10,2) NOT NULL,
    discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    total NUMERIC(10,2) NOT NULL,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Crear tabla: audit_logs (Bitácora inmutable de auditoría para todas las acciones sensibles)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT,
    user_id TEXT NOT NULL,
    user_name TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para optimización de consultas de trazabilidad
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_closed_by_user_id ON orders(closed_by_user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices_arca(user_id);
CREATE INDEX IF NOT EXISTS idx_shifts_status ON cash_register_shifts(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
