-- 1. Create the new commercial entity
CREATE TABLE sales_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_name VARCHAR(255) NOT NULL,
    po_number VARCHAR(100) UNIQUE NOT NULL,
    sales_rep VARCHAR(100),
    target_ship_date TIMESTAMPTZ,
    status VARCHAR(50) NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Link the physical machines to the commercial order
ALTER TABLE machines
    ADD COLUMN sales_order_id UUID REFERENCES sales_orders(id) ON DELETE RESTRICT,
    ALTER COLUMN status SET DEFAULT 'engineering';
