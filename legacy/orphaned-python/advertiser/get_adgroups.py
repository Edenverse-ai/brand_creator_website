# File: get_adgroups.py
import requests
import json

# --- TikTok Settings ---
TIKTOK_ACCESS_TOKEN = "9a95a7a436e385a464784c40dc993b66830a0902"  # Must have valid 'adgroups read' scope
TIKTOK_API_BASE = "https://business-api.tiktok.com/open_api/v1.3"

# --- Supabase Settings ---
SUPABASE_URL = "https://jmbibmulwznrgtrkwrxk.supabase.co"
SUPABASE_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptYmlibXVsd3pucmd0cmt3cnhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MDY4MzI4NywiZXhwIjoyMDU2MjU5Mjg3fQ.1j61oj07IGEa_pTPilCmHAZ3XrQkIRSZjrNh0GrkgjQ" 


def fetch_tiktok_adgroups(advertiser_id: str):
    """
    Retrieves ad group information from TikTok's /adgroup/get/ endpoint for the specified advertiser.
    Returns a list of dictionaries: [{advertiser_id, adgroup_id, status}, ...].
    """
    endpoint = f"{TIKTOK_API_BASE}/adgroup/get/"
    headers = {
        "Access-Token": TIKTOK_ACCESS_TOKEN
    }
    params = {
        "advertiser_id": advertiser_id,
        "page_size": 50
        # Optionally add "page": 2,... if needed, or keep reading until no more data
    }

    resp = requests.get(endpoint, headers=headers, params=params)
    resp.raise_for_status()
    data = resp.json()

    if data.get("code") != 0:
        print("TikTok API error:", data.get("message"))
        return []

    adgroups = data.get("data", {}).get("list", [])
    
    results = []
    for adg in adgroups:
        adgroup_id = adg.get("adgroup_id")
        # "operation_status" / "opt_status" / "status" depending on the version
        status = adg.get("operation_status") or adg.get("status")

        record = {
            "advertiser_id": advertiser_id,
            "adgroup_id": adgroup_id,
            "status": status
        }
        results.append(record)
    return results


def upsert_adgroups_in_supabase(adgroups: list):
    """
    For each adgroup record {advertiser_id, adgroup_id, status}:
      - If adgroup_id already exists in 'omgbeautybox_new', update its status
      - Otherwise insert a new row
    
    Because Supabase doesn't have a built-in PATCH by primary key, we can do:
      - SELECT existing rows by adgroup_id
      - If found, do a PATCH with new status
      - Else do a POST (insert)
    
    Alternatively, if your table is set up with primary key = (advertiser_id, adgroup_id)
    and you can do "UPSERT", you can pass a "Prefer": "resolution=merge-duplicates" header.
    """
    if not adgroups:
        print("No adgroups to upsert.")
        return

    # Example using UPSERT approach if your table has unique key on (advertiser_id, adgroup_id)
    endpoint = f"{SUPABASE_URL}/rest/v1/omgbeautybox_new"
    headers = {
        "apikey": SUPABASE_API_KEY,
        "Authorization": f"Bearer {SUPABASE_API_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"  # This enables upsert-like behavior
    }

    # This approach will either insert or update existing records based on your table's unique constraint
    payload = json.dumps(adgroups)
    resp = requests.post(endpoint, headers=headers, data=payload)
    if resp.status_code < 300:
        print(f"Upserted {len(adgroups)} adgroup(s) into omgbeautybox_new.")
    else:
        print("Failed to upsert adgroups:", resp.text)
