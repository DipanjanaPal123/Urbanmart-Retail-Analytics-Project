"""
Generates a realistic 3-year retail sales dataset (2022-2024) for a fictional
retail chain 'UrbanMart' — used as the data source for the whole project
(SQL database, Python analysis, Power BI dashboard, Excel summary).

Run once: python generate_dataset.py
Outputs: sales_data.csv, customers.csv, products.csv
"""
import pandas as pd
import numpy as np
from datetime import datetime, timedelta

np.random.seed(42)

# ---------------- Products ----------------
categories = {
    "Electronics": ["Wireless Earbuds", "Bluetooth Speaker", "Smartwatch", "Laptop Stand", "Power Bank", "USB-C Hub"],
    "Home & Kitchen": ["Air Fryer", "Coffee Maker", "Blender", "Cookware Set", "Vacuum Cleaner", "Toaster"],
    "Apparel": ["Running Shoes", "Denim Jacket", "Winter Coat", "Yoga Pants", "Cotton T-Shirt", "Backpack"],
    "Beauty & Personal Care": ["Face Serum", "Hair Dryer", "Electric Toothbrush", "Perfume", "Skincare Set"],
    "Sports & Outdoors": ["Yoga Mat", "Dumbbell Set", "Camping Tent", "Water Bottle", "Cycling Helmet"],
    "Office Supplies": ["Ergonomic Chair", "Standing Desk", "Notebook Set", "Desk Organizer", "Monitor Arm"],
}
base_prices = {
    "Wireless Earbuds": 59.99, "Bluetooth Speaker": 45.99, "Smartwatch": 149.99, "Laptop Stand": 29.99,
    "Power Bank": 24.99, "USB-C Hub": 34.99, "Air Fryer": 89.99, "Coffee Maker": 64.99, "Blender": 39.99,
    "Cookware Set": 129.99, "Vacuum Cleaner": 159.99, "Toaster": 27.99, "Running Shoes": 79.99,
    "Denim Jacket": 69.99, "Winter Coat": 119.99, "Yoga Pants": 34.99, "Cotton T-Shirt": 14.99,
    "Backpack": 49.99, "Face Serum": 32.99, "Hair Dryer": 42.99, "Electric Toothbrush": 54.99,
    "Perfume": 74.99, "Skincare Set": 89.99, "Yoga Mat": 22.99, "Dumbbell Set": 99.99,
    "Camping Tent": 189.99, "Water Bottle": 15.99, "Cycling Helmet": 44.99, "Ergonomic Chair": 249.99,
    "Standing Desk": 329.99, "Notebook Set": 9.99, "Desk Organizer": 19.99, "Monitor Arm": 59.99,
}

products = []
pid = 1
for cat, items in categories.items():
    for item in items:
        products.append({"product_id": f"P{pid:04d}", "product_name": item, "category": cat,
                          "unit_price": base_prices[item], "unit_cost": round(base_prices[item] * np.random.uniform(0.45, 0.65), 2)})
        pid += 1
products_df = pd.DataFrame(products)

# ---------------- Customers ----------------
regions = ["North", "South", "East", "West", "Central"]
segments = ["Consumer", "Small Business", "Corporate"]
n_customers = 1200
first_names = ["James","Mary","Robert","Patricia","John","Jennifer","Michael","Linda","David","Elizabeth",
               "William","Barbara","Richard","Susan","Joseph","Jessica","Thomas","Sarah","Charles","Karen",
               "Priya","Arjun","Wei","Sofia","Ahmed","Elena","Carlos","Yuki","Fatima","Liam"]
last_names = ["Smith","Johnson","Williams","Brown","Jones","Garcia","Miller","Davis","Rodriguez","Martinez",
              "Chen","Patel","Kim","Nguyen","Silva","Kumar","Muller","Rossi","Andersson","Dubois"]

customers = []
for i in range(1, n_customers + 1):
    signup = datetime(2022, 1, 1) + timedelta(days=int(np.random.uniform(0, 1000)))
    customers.append({
        "customer_id": f"C{i:05d}",
        "customer_name": f"{np.random.choice(first_names)} {np.random.choice(last_names)}",
        "region": np.random.choice(regions, p=[0.22, 0.20, 0.18, 0.22, 0.18]),
        "segment": np.random.choice(segments, p=[0.65, 0.25, 0.10]),
        "signup_date": signup.strftime("%Y-%m-%d"),
    })
customers_df = pd.DataFrame(customers)

# ---------------- Sales Transactions ----------------
start_date = datetime(2022, 1, 1)
end_date = datetime(2024, 12, 31)
n_days = (end_date - start_date).days

rows = []
order_id = 1
for day_offset in range(n_days + 1):
    date = start_date + timedelta(days=day_offset)
    # seasonality: more orders on weekends, holiday spikes in Nov/Dec, gradual YoY growth
    weekday_factor = 1.3 if date.weekday() >= 5 else 1.0
    month_factor = 1.6 if date.month in (11, 12) else (0.85 if date.month in (1, 2) else 1.0)
    year_growth = 1.0 + 0.15 * (date.year - 2022)
    base_orders = 8 * weekday_factor * month_factor * year_growth
    n_orders_today = np.random.poisson(base_orders)

    for _ in range(n_orders_today):
        cust = customers_df.sample(1).iloc[0]
        n_items = np.random.choice([1, 2, 3, 4], p=[0.5, 0.3, 0.15, 0.05])
        chosen_products = products_df.sample(n_items)
        discount = np.random.choice([0, 0, 0, 0.05, 0.10, 0.15, 0.20], p=[0.45,0.1,0.1,0.15,0.1,0.06,0.04])
        for _, prod in chosen_products.iterrows():
            qty = np.random.choice([1, 1, 1, 2, 3], p=[0.55, 0.15, 0.1, 0.13, 0.07])
            gross = round(prod["unit_price"] * qty, 2)
            net = round(gross * (1 - discount), 2)
            rows.append({
                "order_id": f"O{order_id:06d}",
                "order_date": date.strftime("%Y-%m-%d"),
                "customer_id": cust["customer_id"],
                "product_id": prod["product_id"],
                "quantity": qty,
                "discount_pct": discount,
                "gross_sales": gross,
                "net_sales": net,
                "unit_cost": prod["unit_cost"],
                "profit": round(net - (prod["unit_cost"] * qty), 2),
            })
        order_id += 1

sales_df = pd.DataFrame(rows)

products_df.to_csv("products.csv", index=False)
customers_df.to_csv("customers.csv", index=False)
sales_df.to_csv("sales_data.csv", index=False)

print(f"Generated {len(sales_df):,} order lines, {sales_df['order_id'].nunique():,} orders, "
      f"{len(customers_df):,} customers, {len(products_df):,} products.")
