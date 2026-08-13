-- 1. Unlink physical machines from commercial order
ALTER TABLE machines
    DROP COLUMN sales_order_id,
    ALTER COLUMN status SET DEFAULT 'kitting';

-- 2. Drop the commercial entity
DROP TABLE sales_orders;
