-- Migración Inicial: Esquema de Base de Datos y Semilla para Fuego & Brasa

-- Habilitar extensión pgcrypto para generación de UUIDs si no está habilitada
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =========================================================================
-- 1. CREACIÓN DE TABLAS
-- =========================================================================

-- Tabla: tables (Mesas del Salón)
CREATE TABLE IF NOT EXISTS tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    number TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'libre' CHECK (status IN ('libre', 'ocupada', 'cuenta')),
    capacity INTEGER NOT NULL DEFAULT 4 CHECK (capacity > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabla: categories (Categorías de Productos)
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    icon TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabla: products (Productos del Menú)
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    price NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    detail TEXT,
    vat_rate NUMERIC(5,2) NOT NULL DEFAULT 21.00 CHECK (vat_rate >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabla: orders (Comandas / Órdenes)
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    table_id UUID REFERENCES tables(id) ON DELETE SET NULL,
    origin TEXT NOT NULL CHECK (origin IN ('salon', 'takeaway', 'qr')),
    customer_name TEXT,
    customer_phone TEXT,
    estimated_time TIME,
    notes TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
    kds_status TEXT NOT NULL DEFAULT 'pending' CHECK (kds_status IN ('pending', 'preparing', 'ready', 'delivered')),
    subtotal NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (subtotal >= 0),
    discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00 CHECK (discount_pct >= 0 AND discount_pct <= 100),
    discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
    payment_method TEXT CHECK (payment_method IN ('efectivo', 'debito', 'credito', 'qr')),
    total NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (total >= 0),
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabla: order_items (Ítems de las Comandas)
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
    notes TEXT, -- Ej: punto de cocción "Jugoso", "A punto", "Cocido"
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabla: invoices_arca (Facturas Fiscales - ARCA / AFIP)
CREATE TABLE IF NOT EXISTS invoices_arca (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID UNIQUE NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    invoice_number TEXT UNIQUE NOT NULL, -- Ej: "0001-00000045"
    cae TEXT, -- Código de Autorización Electrónico
    cae_due_date DATE, -- Vencimiento CAE
    invoice_type TEXT NOT NULL CHECK (invoice_type IN ('A', 'B', 'C')),
    doc_type INTEGER NOT NULL DEFAULT 96, -- 96: DNI, 80: CUIT, 99: Consumidor Final
    doc_number TEXT NOT NULL DEFAULT '99',
    net_amount NUMERIC(10,2) NOT NULL CHECK (net_amount >= 0),
    vat_rate NUMERIC(5,2) NOT NULL DEFAULT 21.00,
    vat_amount NUMERIC(10,2) NOT NULL CHECK (vat_amount >= 0),
    exempt_amount NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (exempt_amount >= 0),
    total_amount NUMERIC(10,2) NOT NULL CHECK (total_amount >= 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    arca_response JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabla: inventory_stock (Control de Stock de Inventario)
CREATE TABLE IF NOT EXISTS inventory_stock (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID UNIQUE REFERENCES products(id) ON DELETE SET NULL, -- Nullable si es un insumo crudo no vendible directamente
    name TEXT NOT NULL,
    current_quantity NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    unit TEXT NOT NULL, -- 'kg', 'unidad', 'litros', etc.
    min_stock NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (min_stock >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Tabla: stock_purchases (Registro de Compras de Stock)
CREATE TABLE IF NOT EXISTS stock_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventory_item_id UUID NOT NULL REFERENCES inventory_stock(id) ON DELETE CASCADE,
    quantity NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
    total_price NUMERIC(10,2) NOT NULL CHECK (total_price >= 0),
    supplier TEXT,
    purchase_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =========================================================================
-- 2. TRIGGERS Y FUNCIONES AUTOMÁTICAS
-- =========================================================================

-- Función para actualizar el campo updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Asignar trigger de updated_at a tables, orders, e inventory_stock
CREATE TRIGGER trg_tables_updated_at
    BEFORE UPDATE ON tables
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_inventory_stock_updated_at
    BEFORE UPDATE ON inventory_stock
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Función para descontar stock automáticamente al ordenar un producto
CREATE OR REPLACE FUNCTION deduct_stock_on_order_item_insert()
RETURNS TRIGGER AS $$
BEGIN
    -- Descontar del stock si el producto tiene un registro en inventory_stock
    UPDATE inventory_stock
    SET current_quantity = current_quantity - NEW.quantity,
        updated_at = now()
    WHERE product_id = NEW.product_id;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para descontar stock en inserción de ítem de orden
CREATE TRIGGER trg_deduct_stock_on_order
    AFTER INSERT ON order_items
    FOR EACH ROW
    EXECUTE FUNCTION deduct_stock_on_order_item_insert();

-- =========================================================================
-- 3. SEMILLA DE DATOS (SEED DATA)
-- =========================================================================

-- Mesas (01 a 12)
INSERT INTO tables (number, status, capacity) VALUES
('01', 'libre', 2),
('02', 'ocupada', 4),
('03', 'ocupada', 4),
('04', 'libre', 6),
('05', 'cuenta', 4),
('06', 'ocupada', 2),
('07', 'libre', 4),
('08', 'ocupada', 4),
('09', 'libre', 8),
('10', 'ocupada', 4),
('11', 'cuenta', 6),
('12', 'libre', 2)
ON CONFLICT (number) DO NOTHING;

-- Categorías
INSERT INTO categories (id, name, slug, icon) VALUES
('c1000000-0000-0000-0000-000000000001', 'Cortes', 'cortes', 'Flame'),
('c1000000-0000-0000-0000-000000000002', 'Guarniciones', 'guarniciones', 'Utensils'),
('c1000000-0000-0000-0000-000000000003', 'Minutas', 'minutas', 'ShoppingBag'),
('c1000000-0000-0000-0000-000000000004', 'Bebidas', 'bebidas', 'Bell'),
('c1000000-0000-0000-0000-000000000005', 'Postres', 'postres', 'ChefHat')
ON CONFLICT (slug) DO NOTHING;

-- Productos
INSERT INTO products (id, category_id, name, price, detail, vat_rate, is_active) VALUES
-- Cortes (Alícuota general o diferencial. En Argentina, la carne vacuna faenada tributa al 10.5% en algunas partes de la cadena, pero en restaurante tributa al 21%)
('p1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'Bife de Chorizo', 18500.00, '400g · a la parrilla', 21.00, true),
('p1000000-0000-0000-0000-000000000002', 'c1000000-0000-0000-0000-000000000001', 'Ojo de Bife', 21000.00, '350g · corte premium', 21.00, true),
('p1000000-0000-0000-0000-000000000003', 'c1000000-0000-0000-0000-000000000001', 'Entraña Fuego', 16800.00, '300g · chimichurri', 21.00, true),

-- Guarniciones
('p1000000-0000-0000-0000-000000000004', 'c1000000-0000-0000-0000-000000000002', 'Papas Fritas', 4800.00, 'con provenzal', 21.00, true),
('p1000000-0000-0000-0000-000000000005', 'c1000000-0000-0000-0000-000000000002', 'Ensalada Criolla', 4200.00, 'tomate · cebolla · ají', 21.00, true),

-- Minutas
('p1000000-0000-0000-0000-000000000006', 'c1000000-0000-0000-0000-000000000003', 'Empanadas de Carne', 3200.00, 'unidad · al horno', 21.00, true),

-- Bebidas
('p1000000-0000-0000-0000-000000000007', 'c1000000-0000-0000-0000-000000000004', 'Agua Mineral', 2200.00, 'sin gas 500ml', 21.00, true),

-- Postres
('p1000000-0000-0000-0000-000000000008', 'c1000000-0000-0000-0000-000000000005', 'Flan Casero', 3900.00, 'con dulce de leche', 21.00, true)
ON CONFLICT (id) DO NOTHING;

-- Inventario Inicial (Mapeo directo de productos controlados en stock)
INSERT INTO inventory_stock (product_id, name, current_quantity, unit, min_stock) VALUES
('p1000000-0000-0000-0000-000000000001', 'Porciones Bife de Chorizo', 50.00, 'unidad', 10.00),
('p1000000-0000-0000-0000-000000000002', 'Porciones Ojo de Bife', 40.00, 'unidad', 8.00),
('p1000000-0000-0000-0000-000000000003', 'Porciones Entraña Fuego', 30.00, 'unidad', 6.00),
('p1000000-0000-0000-0000-000000000007', 'Agua Mineral 500ml', 120.00, 'unidad', 24.00)
ON CONFLICT (product_id) DO NOTHING;
