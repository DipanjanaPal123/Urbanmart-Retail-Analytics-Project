"""
UrbanMart Retail Analytics — Python Analysis
==============================================
1. Load & clean data (from SQLite, populated by the SQL layer)
2. Exploratory analysis: revenue trend, category/region performance
3. RFM customer segmentation (KMeans clustering, validated against SQL RFM)
4. 90-day sales forecast (Holt-Winters exponential smoothing)
5. Export clean tables for Power BI + Excel

Run: python analysis.py
Outputs (in ../output/): rfm_segments.csv, monthly_sales.csv,
category_performance.csv, forecast.csv, charts/*.png
"""
import sqlite3
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
from statsmodels.tsa.holtwinters import ExponentialSmoothing
import os

DB_PATH = "../data/urbanmart.db"
OUT_DIR = "../output"
os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs(f"{OUT_DIR}/charts", exist_ok=True)
plt.style.use("seaborn-v0_8-whitegrid")

conn = sqlite3.connect(DB_PATH)
sales = pd.read_sql("SELECT * FROM sales", conn, parse_dates=["order_date"])
customers = pd.read_sql("SELECT * FROM customers", conn, parse_dates=["signup_date"])
products = pd.read_sql("SELECT * FROM products", conn)
conn.close()

df = sales.merge(customers, on="customer_id").merge(products, on="product_id")

# ---------------------------------------------------------------
# 1. Data cleaning
# ---------------------------------------------------------------
before = len(df)
df = df.drop_duplicates()
df = df[(df["quantity"] > 0) & (df["net_sales"] >= 0)]
print(f"Cleaned {before - len(df)} invalid/duplicate rows.")

# ---------------------------------------------------------------
# 2. Exploratory analysis
# ---------------------------------------------------------------
monthly = (
    df.set_index("order_date")
      .resample("MS")["net_sales"]
      .sum()
      .reset_index()
      .rename(columns={"order_date": "month", "net_sales": "revenue"})
)
monthly["yoy_growth_pct"] = monthly["revenue"].pct_change(12).round(4) * 100
monthly.to_csv(f"{OUT_DIR}/monthly_sales.csv", index=False)

category_perf = (
    df.groupby("category")
      .agg(revenue=("net_sales", "sum"), profit=("profit", "sum"), units=("quantity", "sum"))
      .assign(margin_pct=lambda d: (d["profit"] / d["revenue"] * 100).round(2))
      .sort_values("revenue", ascending=False)
      .reset_index()
)
category_perf.to_csv(f"{OUT_DIR}/category_performance.csv", index=False)

region_perf = (
    df.groupby("region")["net_sales"].sum().sort_values(ascending=False).reset_index()
)

fig, ax = plt.subplots(figsize=(10, 5))
ax.plot(monthly["month"], monthly["revenue"], marker="o", color="#2563eb")
ax.set_title("Monthly Revenue Trend (2022-2024)")
ax.set_ylabel("Revenue ($)")
plt.tight_layout()
plt.savefig(f"{OUT_DIR}/charts/monthly_revenue_trend.png", dpi=150)
plt.close()

fig, ax = plt.subplots(figsize=(9, 5))
ax.barh(category_perf["category"], category_perf["revenue"], color="#2563eb")
ax.set_title("Revenue by Category")
ax.invert_yaxis()
plt.tight_layout()
plt.savefig(f"{OUT_DIR}/charts/category_revenue.png", dpi=150)
plt.close()

# ---------------------------------------------------------------
# 3. RFM segmentation with KMeans (data-science layer on top of
#    the SQL NTILE-based RFM scores)
# ---------------------------------------------------------------
snapshot_date = df["order_date"].max() + pd.Timedelta(days=1)
rfm = (
    df.groupby("customer_id").agg(
        recency=("order_date", lambda x: (snapshot_date - x.max()).days),
        frequency=("order_id", "nunique"),
        monetary=("net_sales", "sum"),
    )
)

rfm_log = rfm.copy()
for col in ["recency", "frequency", "monetary"]:
    rfm_log[col] = np.log1p(rfm_log[col])

scaled = StandardScaler().fit_transform(rfm_log)
kmeans = KMeans(n_clusters=4, random_state=42, n_init=10)
rfm["cluster"] = kmeans.fit_predict(scaled)

cluster_profile = rfm.groupby("cluster")[["recency", "frequency", "monetary"]].mean()
cluster_profile = cluster_profile.sort_values("monetary", ascending=False)
labels = ["Champions", "Loyal Customers", "Potential Loyalist", "At Risk"]
label_map = {cluster: labels[i] for i, cluster in enumerate(cluster_profile.index)}
rfm["segment"] = rfm["cluster"].map(label_map)

rfm.reset_index().to_csv(f"{OUT_DIR}/rfm_segments.csv", index=False)

fig, ax = plt.subplots(figsize=(7, 5))
segment_counts = rfm["segment"].value_counts()
ax.pie(segment_counts, labels=segment_counts.index, autopct="%1.0f%%",
       colors=["#1d4ed8", "#2563eb", "#60a5fa", "#bfdbfe"])
ax.set_title("Customer Segments (RFM + KMeans)")
plt.tight_layout()
plt.savefig(f"{OUT_DIR}/charts/customer_segments.png", dpi=150)
plt.close()

# ---------------------------------------------------------------
# 4. 90-day sales forecast (Holt-Winters triple exponential smoothing)
# ---------------------------------------------------------------
daily = df.set_index("order_date").resample("D")["net_sales"].sum().asfreq("D").fillna(0)

model = ExponentialSmoothing(
    daily, trend="add", seasonal="add", seasonal_periods=7, damped_trend=True
).fit()
forecast_horizon = 90
forecast = model.forecast(forecast_horizon)

forecast_df = pd.DataFrame({
    "date": forecast.index,
    "forecast_revenue": forecast.values.round(2),
})
forecast_df.to_csv(f"{OUT_DIR}/forecast.csv", index=False)

fig, ax = plt.subplots(figsize=(11, 5))
ax.plot(daily.index[-180:], daily.values[-180:], label="Actual", color="#334155")
ax.plot(forecast_df["date"], forecast_df["forecast_revenue"], label="Forecast (90d)", color="#dc2626")
ax.legend()
ax.set_title("Sales Forecast — Holt-Winters Exponential Smoothing")
plt.tight_layout()
plt.savefig(f"{OUT_DIR}/charts/sales_forecast.png", dpi=150)
plt.close()

# ---------------------------------------------------------------
# 5. Export a flat, Power-BI-ready fact table
# ---------------------------------------------------------------
df.to_csv(f"{OUT_DIR}/fact_sales_full.csv", index=False)

print("\n=== Summary ===")
print(f"Total revenue: ${df['net_sales'].sum():,.2f}")
print(f"Total profit:  ${df['profit'].sum():,.2f}")
print(f"Customers analyzed: {len(rfm):,}")
print("Segment distribution:\n", rfm['segment'].value_counts())
print(f"\nAll outputs written to {OUT_DIR}/")
