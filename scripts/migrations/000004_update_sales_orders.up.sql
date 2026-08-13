ALTER TABLE sales_orders
    ADD COLUMN internal_project_number VARCHAR(100),
    ADD COLUMN project_name VARCHAR(255),
    ADD COLUMN responsible_person VARCHAR(100);
