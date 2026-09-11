ALTER TABLE machines DROP CONSTRAINT IF EXISTS machines_sales_order_id_fkey;
ALTER TABLE machines ADD CONSTRAINT machines_sales_order_id_fkey 
    FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id) ON DELETE RESTRICT;
DROP INDEX IF EXISTS idx_sales_orders_status;
