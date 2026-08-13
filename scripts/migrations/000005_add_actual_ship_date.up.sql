ALTER TABLE machines ADD COLUMN actual_ship_date TIMESTAMPTZ;
ALTER TABLE sales_orders ADD COLUMN actual_ship_date TIMESTAMPTZ;
