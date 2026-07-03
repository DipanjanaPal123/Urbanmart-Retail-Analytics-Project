-- ============================================================
-- UrbanMart Retail Analytics — Database Schema
-- Works on PostgreSQL / MySQL / SQLite (minor type tweaks noted)
-- ============================================================

DROP TABLE IF EXISTS sales;
DROP TABLE IF EXISTS customers;
DROP TABLE IF EXISTS products;

CREATE TABLE customers (
    customer_id   VARCHAR(10) PRIMARY KEY,
    customer_name VARCHAR(100) NOT NULL,
    region        VARCHAR(20) NOT NULL,
    segment       VARCHAR(20) NOT NULL,
    signup_date   DATE NOT NULL
);

CREATE TABLE products (
    product_id    VARCHAR(10) PRIMARY KEY,
    product_name  VARCHAR(100) NOT NULL,
    category      VARCHAR(50) NOT NULL,
    unit_price    DECIMAL(10,2) NOT NULL,
    unit_cost     DECIMAL(10,2) NOT NULL
);

CREATE TABLE sales (
    order_id      VARCHAR(10) NOT NULL,
    order_date    DATE NOT NULL,
    customer_id   VARCHAR(10) NOT NULL REFERENCES customers(customer_id),
    product_id    VARCHAR(10) NOT NULL REFERENCES products(product_id),
    quantity      INT NOT NULL,
    discount_pct  DECIMAL(4,2) NOT NULL,
    gross_sales   DECIMAL(10,2) NOT NULL,
    net_sales     DECIMAL(10,2) NOT NULL,
    unit_cost     DECIMAL(10,2) NOT NULL,
    profit        DECIMAL(10,2) NOT NULL
);

-- Helpful indexes for the analytical queries below
CREATE INDEX idx_sales_date ON sales(order_date);
CREATE INDEX idx_sales_customer ON sales(customer_id);
CREATE INDEX idx_sales_product ON sales(product_id);

-- ---- Loading data (psql example; adjust per your SQL engine) ----
-- \copy customers FROM 'data/customers.csv' DELIMITER ',' CSV HEADER;
-- \copy products  FROM 'data/products.csv'  DELIMITER ',' CSV HEADER;
-- \copy sales     FROM 'data/sales_data.csv' DELIMITER ',' CSV HEADER;
