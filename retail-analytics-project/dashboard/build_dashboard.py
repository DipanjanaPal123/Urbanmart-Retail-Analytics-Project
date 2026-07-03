"""
Rebuilds dashboard/index.html by injecting the latest
python/output/dashboard_data.json into index.template.html.

Run this after re-running python/prepare_dashboard_data.py with new data.
"""
with open("index.template.html") as f:
    tpl = f.read()
with open("../python/output/dashboard_data.json") as f:
    data = f.read()

html = tpl.replace("__DASHBOARD_DATA__", data)

with open("index.html", "w") as f:
    f.write(html)

print(f"Built index.html ({len(html)/1024:.0f} KB)")
