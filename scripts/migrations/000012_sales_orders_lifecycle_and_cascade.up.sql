-- Migration 000012: Optimize sales_orders status queries and allow cascading machine deletes on project deletion
CREATE INDEX IF NOT EXISTS idx_sales_orders_status ON sales_orders(status);

-- Change foreign key on machines.sales_order_id from ON DELETE RESTRICT to ON DELETE CASCADE
ALTER TABLE machines DROP CONSTRAINT IF EXISTS machines_sales_order_id_fkey;
ALTER TABLE machines ADD CONSTRAINT machines_sales_order_id_fkey 
    FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id) ON DELETE CASCADE;
