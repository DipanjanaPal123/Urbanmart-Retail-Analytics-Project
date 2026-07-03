-- ============================================================
-- UrbanMart Retail Analytics — Business Queries
-- Demonstrates: joins, CTEs, window functions, aggregation,
-- YoY growth, RFM segmentation, cohort retention
-- ============================================================

-- 1. Executive KPI summary --------------------------------------------------
SELECT
    COUNT(DISTINCT order_id)                       AS total_orders,
    COUNT(DISTINCT customer_id)                     AS active_customers,
    ROUND(SUM(net_sales), 2)                        AS total_revenue,
    ROUND(SUM(profit), 2)                           AS total_profit,
    ROUND(SUM(profit) / NULLIF(SUM(net_sales), 0) * 100, 2) AS profit_margin_pct,
    ROUND(SUM(net_sales) / COUNT(DISTINCT order_id), 2)     AS avg_order_value
FROM sales;


-- 2. Monthly revenue trend + Year-over-Year growth --------------------------
WITH monthly AS (
    SELECT
        DATE_TRUNC('month', order_date)::date AS month,
        SUM(net_sales) AS revenue
    FROM sales
    GROUP BY 1
)
SELECT
    month,
    revenue,
    LAG(revenue, 12) OVER (ORDER BY month)                                   AS revenue_last_year,
    ROUND( (revenue - LAG(revenue, 12) OVER (ORDER BY month))
           / NULLIF(LAG(revenue, 12) OVER (ORDER BY month), 0) * 100, 2)     AS yoy_growth_pct
FROM monthly
ORDER BY month;


-- 3. Top 10 products by revenue and profit margin ---------------------------
SELECT
    p.product_name,
    p.category,
    SUM(s.quantity)                                    AS units_sold,
    ROUND(SUM(s.net_sales), 2)                         AS revenue,
    ROUND(SUM(s.profit), 2)                            AS profit,
    ROUND(SUM(s.profit) / NULLIF(SUM(s.net_sales),0) * 100, 2) AS margin_pct
FROM sales s
JOIN products p ON p.product_id = s.product_id
GROUP BY p.product_name, p.category
ORDER BY revenue DESC
LIMIT 10;


-- 4. Regional performance with rank -----------------------------------------
SELECT
    c.region,
    ROUND(SUM(s.net_sales), 2) AS revenue,
    RANK() OVER (ORDER BY SUM(s.net_sales) DESC) AS region_rank
FROM sales s
JOIN customers c ON c.customer_id = s.customer_id
GROUP BY c.region
ORDER BY revenue DESC;


-- 5. RFM Customer Segmentation ------------------------------------------------
-- Recency, Frequency, Monetary scoring (1-5, 5 = best) used to feed the
-- Python segmentation step and the Power BI "Customer Value" page.
WITH customer_rfm AS (
    SELECT
        s.customer_id,
        MAX(s.order_date) AS last_order_date,
        (SELECT MAX(order_date) FROM sales) - MAX(s.order_date) AS recency_days,
        COUNT(DISTINCT s.order_id) AS frequency,
        ROUND(SUM(s.net_sales), 2) AS monetary
    FROM sales s
    GROUP BY s.customer_id
),
scored AS (
    SELECT
        customer_id, recency_days, frequency, monetary,
        NTILE(5) OVER (ORDER BY recency_days DESC) AS r_score,
        NTILE(5) OVER (ORDER BY frequency ASC)     AS f_score,
        NTILE(5) OVER (ORDER BY monetary ASC)      AS m_score
    FROM customer_rfm
)
SELECT
    customer_id, recency_days, frequency, monetary,
    r_score, f_score, m_score,
    (r_score + f_score + m_score) AS rfm_total,
    CASE
        WHEN (r_score + f_score + m_score) >= 13 THEN 'Champions'
        WHEN (r_score + f_score + m_score) >= 10 THEN 'Loyal Customers'
        WHEN (r_score + f_score + m_score) >= 7  THEN 'Potential Loyalist'
        WHEN (r_score + f_score + m_score) >= 4  THEN 'At Risk'
        ELSE 'Lost'
    END AS customer_segment
FROM scored
ORDER BY rfm_total DESC;


-- 6. Monthly cohort retention -------------------------------------------------
WITH first_purchase AS (
    SELECT customer_id, DATE_TRUNC('month', MIN(order_date))::date AS cohort_month
    FROM sales
    GROUP BY customer_id
),
activity AS (
    SELECT
        s.customer_id,
        f.cohort_month,
        DATE_TRUNC('month', s.order_date)::date AS activity_month
    FROM sales s
    JOIN first_purchase f ON f.customer_id = s.customer_id
)
SELECT
    cohort_month,
    (EXTRACT(YEAR FROM activity_month) - EXTRACT(YEAR FROM cohort_month)) * 12
      + (EXTRACT(MONTH FROM activity_month) - EXTRACT(MONTH FROM cohort_month)) AS month_number,
    COUNT(DISTINCT customer_id) AS active_customers
FROM activity
GROUP BY cohort_month, month_number
ORDER BY cohort_month, month_number;


-- 7. Running total revenue (for Power BI validation / Excel checks) --------
SELECT
    order_date,
    SUM(net_sales) AS daily_revenue,
    SUM(SUM(net_sales)) OVER (ORDER BY order_date) AS running_total_revenue
FROM sales
GROUP BY order_date
ORDER BY order_date;
