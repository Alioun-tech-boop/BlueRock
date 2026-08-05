"""
Scrape real company logos from BRVM website and store them in the backend static directory.
Run inside the Docker container.
"""
import sys, os, json, re, time
sys.path.insert(0, '/app')

import httpx
from bs4 import BeautifulSoup

BRVM_BASE = "https://www.brvm.org"

def download_logos():
    client = httpx.Client(timeout=30.0, follow_redirects=True)
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
    
    # Create logos directory
    logos_dir = "/app/static/logos"
    os.makedirs(logos_dir, exist_ok=True)
    
    company_logos = {}  # symbol -> logo_path
    
    for page in range(5):
        url = "%s/fr/emetteurs/societes-cotees?page=%d" % (BRVM_BASE, page)
        print("Fetching page %d..." % (page + 1))
        
        try:
            resp = client.get(url, headers=headers, timeout=30)
            soup = BeautifulSoup(resp.text, 'lxml')
        except Exception as e:
            print("  Error fetching page: %s" % e)
            continue
        
        items = soup.select('.views-box-item')
        print("  Found %d items" % len(items))
        
        for item in items:
            # Get the logo image
            visuel = item.select_one('.visuel_sgi a img')
            if not visuel:
                continue
            
            logo_url = visuel.get('src', '')
            if not logo_url or 'default' in logo_url:
                continue
            
            if logo_url.startswith('//'):
                logo_url = 'https:' + logo_url
            elif logo_url.startswith('/'):
                logo_url = BRVM_BASE + logo_url
            
            # Get company name from the title
            title_el = item.select_one('.title')
            if not title_el:
                continue
            
            # Get the link to the company detail page for extracting the symbol
            link_el = item.select_one('.visuel_sgi a')
            detail_path = link_el.get('href', '') if link_el else ''
            
            # Extract company name
            name = title_el.get_text(strip=True)
            
            # Download the logo
            try:
                img_resp = client.get(logo_url, headers=headers, timeout=15)
                if img_resp.status_code == 200:
                    # Create a safe filename from the original URL
                    ext = os.path.splitext(logo_url.split('?')[0])[1] or '.jpg'
                    # Use the detail path slug as filename
                    slug = detail_path.rstrip('/').split('/')[-1] if detail_path else name.replace(' ', '_').lower()[:50]
                    safe_name = re.sub(r'[^a-zA-Z0-9_-]', '_', slug)[:50] + ext
                    
                    filepath = os.path.join(logos_dir, safe_name)
                    with open(filepath, 'wb') as f:
                        f.write(img_resp.content)
                    
                    # Store mapping: we'll match by name later
                    company_logos[name] = '/static/logos/' + safe_name
                    print("    %s -> %s" % (logo_url.split('/')[-1].split('?')[0][:30], safe_name))
                else:
                    print("    Failed to download: %s (HTTP %d)" % (logo_url.split('/')[-1].split('?')[0][:30], img_resp.status_code))
            except Exception as e:
                print("    Error downloading %s: %s" % (logo_url, e))
    
    client.close()
    
    # Save the mapping
    mapping_file = "/app/static/logo_mapping.json"
    with open(mapping_file, 'w', encoding='utf-8') as f:
        json.dump(company_logos, f, indent=2, ensure_ascii=False)
    
    print("\nDownloaded %d logos to %s" % (len(company_logos), logos_dir))
    return company_logos

def update_db_with_logos(mapping):
    """Match logos to companies by name and update the database."""
    sys.path.insert(0, '/app')
    from app.database import SessionLocal
    from app.models.company import Company
    
    db = SessionLocal()
    try:
        companies = db.query(Company).all()
        updated = 0
        unmatched = []
        
        for co in companies:
            # Try to find a matching logo by name
            co_name = co.name.upper().strip()
            matched = False
            
            for logo_name, logo_path in mapping.items():
                logo_upper = logo_name.upper().strip()
                # Check for various matching patterns
                if (co_name == logo_upper or 
                    co_name.startswith(logo_upper[:20]) or 
                    logo_upper.startswith(co_name[:20]) or
                    co.symbol in logo_upper or
                    logo_upper in co_name):
                    co.website = logo_path  # Store logo path in website temporarily
                    updated += 1
                    print("  Matched: %s -> %s" % (co.symbol, logo_name[:40]))
                    matched = True
                    break
            
            if not matched:
                unmatched.append(co.symbol)
        
        db.commit()
        
        if unmatched:
            print("\nUnmatched companies:")
            for sym in unmatched:
                print("  %s" % sym)
        
        print("\nUpdated %d companies with logos" % updated)
    finally:
        db.close()

def serve_logos_via_backend():
    """Configure backend to serve static logos."""
    # Check if the static route already exists in main.py
    main_path = "/app/app/main.py"
    with open(main_path, 'r') as f:
        content = f.read()
    
    if 'static' in content and 'staticfiles' in content:
        print("Static file serving already configured in main.py")
    else:
        print("Need to add static file config to main.py")
        # The static files are served from /app/static via the volume mount

if __name__ == "__main__":
    print("=" * 60)
    print("BRVM COMPANY LOGO SCRAPER")
    print("=" * 60)
    
    mapping = download_logos()
    update_db_with_logos(mapping)
    serve_logos_via_backend()
    print("\nDone!")
