"""
Prepares a single dashboard_data.json consumed by the HTML dashboard.
Run after analysis.py.
"""
import pandas as pd
import numpy as np
import json

df = pd.read_csv("output/fact_sales_full.csv", parse_dates=["order_date"])
rfm = pd.read_csv("output/rfm_segments.csv")
forecast = pd.read_csv("output/forecast.csv", parse_dates=["date"])

df = df.merge(rfm[["customer_id", "segment"]], on="customer_id", how="left", suffixes=("", "_rfm"))
df["segment"] = df["segment_rfm"].fillna(df["segment"])
df["year"] = df["order_date"].dt.year
df["month"] = df["order_date"].dt.to_period("M").astype(str)
df["weekday"] = df["order_date"].dt.day_name()
df["month_name"] = df["order_date"].dt.strftime("%b")

out = {}

# ---------------- Filter option lists ----------------
out["filters"] = {
    "years": sorted(df["year"].unique().tolist()),
    "regions": sorted(df["region"].unique().tolist()),
    "categories": sorted(df["category"].unique().tolist()),
    "segments": sorted([s for s in df["segment"].unique().tolist() if pd.notna(s)]),
}

# ---------------- Row-level compact records (for client-side filtering) ----------------
# Encoded as parallel integer arrays + lookup tables instead of array-of-objects,
# so the browser can filter/aggregate exactly (real nunique counts) without a
# multi-megabyte payload of repeated strings.
region_codes = sorted(df["region"].unique().tolist())
category_codes = sorted(df["category"].unique().tolist())
segment_codes = sorted([s for s in df["segment"].dropna().unique().tolist()])
month_codes = sorted(df["month"].unique().tolist())

region_idx = {v: i for i, v in enumerate(region_codes)}
category_idx = {v: i for i, v in enumerate(category_codes)}
segment_idx = {v: i for i, v in enumerate(segment_codes)}
month_idx_map = {v: i for i, v in enumerate(month_codes)}

order_factor, order_uniques = pd.factorize(df["order_id"])
cust_factor, cust_uniques = pd.factorize(df["customer_id"])

out["lookups"] = {
    "regions": region_codes,
    "categories": category_codes,
    "segments": segment_codes,
    "months": month_codes,
}

out["rows"] = {
    "year": df["year"].astype(int).tolist(),
    "monthIdx": df["month"].map(month_idx_map).tolist(),
    "regionIdx": df["region"].map(region_idx).tolist(),
    "categoryIdx": df["category"].map(category_idx).tolist(),
    "segmentIdx": [int(segment_idx[s]) if pd.notna(s) else -1 for s in df["segment"]],
    "orderIdx": order_factor.tolist(),
    "custIdx": cust_factor.tolist(),
    "revenue": df["net_sales"].round(2).tolist(),
    "profit": df["profit"].round(2).tolist(),
}

# ---------------- KPIs (overall + YoY) ----------------
def kpis_for(frame):
    revenue = float(frame["net_sales"].sum())
    profit = float(frame["profit"].sum())
    orders = int(frame["order_id"].nunique())
    customers = int(frame["customer_id"].nunique())
    return {
        "revenue": revenue,
        "profit": profit,
        "margin": (profit / revenue * 100) if revenue else 0,
        "orders": orders,
        "customers": customers,
        "aov": (revenue / orders) if orders else 0,
    }

this_year = df["year"].max()
last_year = this_year - 1
out["kpis"] = {
    "current": kpis_for(df[df["year"] == this_year]),
    "previous": kpis_for(df[df["year"] == last_year]),
    "allTime": kpis_for(df),
}

# ---------------- Monthly revenue trend (with prior-year overlay) ----------------
monthly = df.groupby("month").agg(revenue=("net_sales", "sum"), profit=("profit", "sum")).reset_index()
monthly["margin"] = (monthly["profit"] / monthly["revenue"] * 100).round(2)
out["monthlyTrend"] = monthly.to_dict(orient="records")

# ---------------- Category performance ----------------
cat = df.groupby("category").agg(
    revenue=("net_sales", "sum"), profit=("profit", "sum"), orders=("order_id", "nunique")
).reset_index()
cat["margin"] = (cat["profit"] / cat["revenue"] * 100).round(2)
cat = cat.sort_values("revenue", ascending=False)
out["categoryPerf"] = cat.to_dict(orient="records")

# ---------------- Region performance ----------------
reg = df.groupby("region").agg(
    revenue=("net_sales", "sum"), profit=("profit", "sum"), orders=("order_id", "nunique")
).reset_index().sort_values("revenue", ascending=False)
out["regionPerf"] = reg.to_dict(orient="records")

# ---------------- Category x Region matrix (for treemap-ish view) ----------------
catreg = df.groupby(["category", "region"])["net_sales"].sum().reset_index()
out["categoryRegion"] = catreg.to_dict(orient="records")

# ---------------- Revenue vs Profit scatter (by category, bubble = orders) ----------------
out["revProfitScatter"] = cat.to_dict(orient="records")

# ---------------- RFM segment distribution ----------------
seg_counts = rfm["segment"].value_counts().reset_index()
seg_counts.columns = ["segment", "count"]
out["segmentCounts"] = seg_counts.to_dict(orient="records")

seg_revenue = df.groupby("segment").agg(revenue=("net_sales", "sum")).reset_index().dropna()
out["segmentRevenue"] = seg_revenue.to_dict(orient="records")

# revenue by segment by year (stacked)
seg_year = df.dropna(subset=["segment"]).groupby(["year", "segment"])["net_sales"].sum().reset_index()
out["segmentByYear"] = seg_year.to_dict(orient="records")

# ---------------- Customer matrix (top 25 by revenue) ----------------
cust = df.groupby("customer_id").agg(
    revenue=("net_sales", "sum"),
    frequency=("order_id", "nunique"),
    last_purchase=("order_date", "max"),
).reset_index()
cust = cust.merge(rfm[["customer_id", "segment"]], on="customer_id", how="left")
cust = cust.merge(df[["customer_id"]].drop_duplicates(), on="customer_id")
names = df[["customer_id"]].drop_duplicates()
# bring in customer_name from original customers file
customers_raw = pd.read_csv("../data/customers.csv")
cust = cust.merge(customers_raw[["customer_id", "customer_name"]], on="customer_id", how="left")
cust["last_purchase"] = cust["last_purchase"].dt.strftime("%Y-%m-%d")
cust = cust.sort_values("revenue", ascending=False).head(25)
out["customerMatrix"] = cust[["customer_name", "revenue", "frequency", "last_purchase", "segment"]].to_dict(orient="records")

# ---------------- Customer Lifetime Value top 20 ----------------
out["clvTop20"] = cust.head(20)[["customer_name", "revenue"]].to_dict(orient="records")

# ---------------- Recency histogram ----------------
snapshot = df["order_date"].max()
rec = df.groupby("customer_id")["order_date"].max().reset_index()
rec["recency_days"] = (snapshot - rec["order_date"]).dt.days
bins = [0, 30, 60, 90, 120, 180, 270, 365, 10000]
labels = ["0-30", "31-60", "61-90", "91-120", "121-180", "181-270", "271-365", "365+"]
rec["bucket"] = pd.cut(rec["recency_days"], bins=bins, labels=labels)
rec_hist = rec["bucket"].value_counts().reindex(labels).reset_index()
rec_hist.columns = ["bucket", "count"]
out["recencyHistogram"] = rec_hist.to_dict(orient="records")

# ---------------- Customer growth: new vs returning per month ----------------
first_purchase = df.groupby("customer_id")["order_date"].min().dt.to_period("M").astype(str)
first_purchase_map = first_purchase.to_dict()
df["is_new"] = df.apply(lambda r: first_purchase_map.get(r["customer_id"]) == r["month"], axis=1)
growth = df.groupby(["month", "is_new"])["customer_id"].nunique().reset_index()
growth_pivot = growth.pivot(index="month", columns="is_new", values="customer_id").fillna(0).reset_index()
growth_pivot.columns = ["month", "returning", "new"] if False else growth_pivot.columns
growth_pivot = growth_pivot.rename(columns={True: "new", False: "returning"})
for c in ["new", "returning"]:
    if c not in growth_pivot.columns:
        growth_pivot[c] = 0
out["customerGrowth"] = growth_pivot[["month", "new", "returning"]].to_dict(orient="records")

# ---------------- Cohort retention heatmap ----------------
cohort_month = df.groupby("customer_id")["order_date"].min().dt.to_period("M")
df["cohort_month"] = df["customer_id"].map(cohort_month)
df["order_period"] = df["order_date"].dt.to_period("M")
df["period_number"] = (df["order_period"] - df["cohort_month"]).apply(lambda x: x.n)
cohort_data = df.groupby(["cohort_month", "period_number"])["customer_id"].nunique().reset_index()
cohort_pivot = cohort_data.pivot(index="cohort_month", columns="period_number", values="customer_id")
cohort_sizes = cohort_pivot[0]
retention = cohort_pivot.divide(cohort_sizes, axis=0).round(3)
retention = retention.iloc[:, :13]  # first 12 months
retention.index = retention.index.astype(str)
cohort_json = []
for cohort, row in retention.iterrows():
    cohort_json.append({"cohort": cohort, "values": [None if pd.isna(v) else round(v * 100, 1) for v in row.tolist()]})
out["cohortRetention"] = {"cohorts": cohort_json, "periods": list(range(retention.shape[1]))}

# ---------------- Forecast (historical tail + forecast) ----------------
hist_tail = df.groupby(df["order_date"].dt.date)["net_sales"].sum().reset_index()
hist_tail.columns = ["date", "revenue"]
hist_tail["date"] = hist_tail["date"].astype(str)
hist_tail = hist_tail.tail(120)
out["historicalDaily"] = hist_tail.to_dict(orient="records")

forecast["date"] = forecast["date"].dt.strftime("%Y-%m-%d")
out["forecast"] = forecast.to_dict(orient="records")
out["forecastSummary"] = {
    "expectedRevenue90d": float(forecast["forecast_revenue"].sum()),
    "avgDailyForecast": float(forecast["forecast_revenue"].mean()),
    "growthVsLast90d": None,
}
last90_actual = df[df["order_date"] > df["order_date"].max() - pd.Timedelta(days=90)]["net_sales"].sum()
out["forecastSummary"]["last90dActual"] = float(last90_actual)
out["forecastSummary"]["growthVsLast90d"] = round(
    (out["forecastSummary"]["expectedRevenue90d"] - last90_actual) / last90_actual * 100, 2
)

# ---------------- Seasonality heatmap (month x weekday avg revenue) ----------------
season = df.groupby(["month_name", "weekday"])["net_sales"].mean().reset_index()
month_order = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]
weekday_order = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]
season["month_name"] = pd.Categorical(season["month_name"], categories=month_order, ordered=True)
season["weekday"] = pd.Categorical(season["weekday"], categories=weekday_order, ordered=True)
season = season.sort_values(["month_name", "weekday"])
out["seasonality"] = {
    "months": month_order,
    "weekdays": weekday_order,
    "values": season.pivot(index="month_name", columns="weekday", values="net_sales").round(0).values.tolist(),
}

# ---------------- Best & worst products ----------------
prod = df.groupby("product_name").agg(revenue=("net_sales", "sum"), profit=("profit", "sum"), units=("quantity", "sum")).reset_index()
out["topProducts"] = prod.sort_values("revenue", ascending=False).head(10).to_dict(orient="records")
out["bottomProducts"] = prod.sort_values("revenue", ascending=True).head(10).to_dict(orient="records")

# ---------------- Decomposition tree data: category -> region -> product ----------------
decomp = df.groupby(["category", "region", "product_name"])["net_sales"].sum().reset_index()
out["decomposition"] = decomp.to_dict(orient="records")

# ---------------- What-if: price elasticity base data ----------------
out["whatIf"] = {
    "baseRevenue": float(df["net_sales"].sum()),
    "elasticity": -1.2,  # assumed price elasticity of demand for simulation
}

import json as _json

def _round_floats(obj, nd=2):
    if isinstance(obj, float):
        return round(obj, nd)
    if isinstance(obj, list):
        return [_round_floats(x, nd) for x in obj]
    if isinstance(obj, dict):
        return {k: _round_floats(v, nd) for k, v in obj.items()}
    return obj

out = _round_floats(out)
with open("output/dashboard_data.json", "w") as f:
    json.dump(out, f, default=str, separators=(",", ":"))

print("Wrote output/dashboard_data.json —", f"{len(json.dumps(out)):,} bytes")
