"""Scrape real company logos from BRVM listing pages."""
import sys, os, json, re
sys.path.insert(0, '/app')

import httpx
from bs4 import BeautifulSoup

BRVM_BASE = "https://www.brvm.org"
LOGOS_DIR = "/app/static/logos"
MAPPING_FILE = "/app/static/logo_mapping.json"

def download_all_logos():
    os.makedirs(LOGOS_DIR, exist_ok=True)
    client = httpx.Client(timeout=30.0, follow_redirects=True)
    headers = {"User-Agent": "Mozilla/5.0"}

    mapping = {}  # detail_path -> (logo_filename, company_name)

    for page in range(5):
        url = f"{BRVM_BASE}/fr/emetteurs/societes-cotees?page={page}"
        print(f"\n--- Page {page+1} ---")
        resp = client.get(url, headers=headers, timeout=30)
        soup = BeautifulSoup(resp.text, "lxml")

        for item in soup.select(".views-box-item"):
            img = item.select_one(".visuel_sgi a img")
            if not img:
                continue
            logo_url = img.get("src", "")
            if not logo_url:
                continue
            # Fix relative URLs
            if logo_url.startswith("//"):
                logo_url = "https:" + logo_url
            elif logo_url.startswith("/"):
                logo_url = BRVM_BASE + logo_url

            link = item.select_one(".visuel_sgi a")
            detail_path = link.get("href", "") if link else ""

            # Get company name
            name_el = item.select_one(".title")
            name = name_el.get_text(strip=True) if name_el else "unknown"

            # Determine extension from URL
            path_only = logo_url.split("?")[0]
            ext = os.path.splitext(path_only)[1] or ".jpg"

            # Build safe filename from the detail path slug
            slug = detail_path.rstrip("/").split("/")[-1] if detail_path else name.lower().replace(" ", "_")[:50]
            safe_name = re.sub(r"[^a-zA-Z0-9_-]", "_", slug)[:50] + ext

            print(f"  {name[:40]:40s} -> {safe_name}")
            mapping[detail_path] = (safe_name, name)

            # Download
            try:
                img_resp = client.get(logo_url, headers=headers, timeout=15)
                if img_resp.status_code == 200:
                    filepath = os.path.join(LOGOS_DIR, safe_name)
                    with open(filepath, "wb") as f:
                        f.write(img_resp.content)
                else:
                    print(f"    HTTP {img_resp.status_code}")
            except Exception as e:
                print(f"    Error: {e}")

    client.close()

    # Save mapping
    with open(MAPPING_FILE, "w", encoding="utf-8") as f:
        json.dump(mapping, f, indent=2, ensure_ascii=False)
    print(f"\nTotal: {len(mapping)} logos downloaded to {LOGOS_DIR}")
    return mapping


def update_companies(mapping):
    """Update Company records with logo URLs."""
    sys.path.insert(0, "/app")
    from app.database import SessionLocal
    from app.models.company import Company

    db = SessionLocal()
    try:
        all_companies = db.query(Company).all()
        updated = 0
        for detail_path, (filename, brvm_name) in mapping.items():
            logo_url = f"/static/logos/{filename}"
            # Extract slug from detail path to match company
            slug = detail_path.rstrip("/").split("/")[-1].lower().replace("-", " ")
            found = False
            for co in all_companies:
                co_slug = co.name.lower().strip()
                # Match by BRVM name segments, symbol, or slug
                if (slug in co_slug or co_slug[:20] in slug[:20] or
                    brvm_name[:20].lower() in co_slug[:20]):
                    co.website = logo_url
                    updated += 1
                    print(f"  {co.symbol:6s} <- {filename}")
                    found = True
                    break
            if not found:
                print(f"  ?? {filename:40s} (name: {brvm_name[:40]})")
        db.commit()
        print(f"\nUpdated {updated} companies")
    finally:
        db.close()


if __name__ == "__main__":
    mapping = download_all_logos()
    update_companies(mapping)
    print("Done!")
