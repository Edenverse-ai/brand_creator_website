# File: get_metrics.py
import requests
import json
from datetime import datetime
from typing import List, Dict, Any

# --- TikTok Settings ---
TIKTOK_ACCESS_TOKEN = "9a95a7a436e385a464784c40dc993b66830a0902"
TIKTOK_API_BASE = "https://business-api.tiktok.com/open_api/v1.3"

# --- Supabase Settings ---
SUPABASE_URL = "https://jmbibmulwznrgtrkwrxk.supabase.co"
SUPABASE_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptYmlibXVsd3pucmd0cmt3cnhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MDY4MzI4NywiZXhwIjoyMDU2MjU5Mjg3fQ.1j61oj07IGEa_pTPilCmHAZ3XrQkIRSZjrNh0GrkgjQ"

def fetch_enabled_adgroups_from_supabase(advertiser_id: str) -> List[str]:
    """
    Retrieves all 'ENABLE' ad group IDs for a given advertiser from Supabase.
    """
    endpoint = f"{SUPABASE_URL}/rest/v1/omgbeautybox_new"
    headers = {
        "apikey": SUPABASE_API_KEY,
        "Authorization": f"Bearer {SUPABASE_API_KEY}"
    }
    params = {
        "select": "adgroup_id",
        "advertiser_id": f"eq.{advertiser_id}",
        "status": "eq.ENABLE"
    }

    response = requests.get(endpoint, headers=headers, params=params)
    response.raise_for_status()
    
    # Extract adgroup_ids from response
    adgroups = response.json()
    adgroup_ids = [adgroup.get("adgroup_id") for adgroup in adgroups if adgroup.get("adgroup_id")]
    return adgroup_ids

def fetch_tiktok_metrics_for_adgroups(
    advertiser_id: str, 
    adgroup_ids: List[str], 
    start_date: str, 
    end_date: str
) -> List[Dict[str, Any]]:
    """
    Fetch metrics for specific ad groups from TikTok API.
    Returns a list of dictionaries with metrics data for each ad group.
    
    Input dates should be in format "YYYY-MM-DD"
    """
    endpoint = f"{TIKTOK_API_BASE}/report/integrated/get/"
    headers = {
        "Access-Token": TIKTOK_ACCESS_TOKEN
    }
    
    # Format the adgroup_ids as a comma-separated string
    adgroup_ids_str = ",".join(adgroup_ids)
    
    params = {
        "advertiser_id": advertiser_id,
        "report_type": "BASIC",
        "dimensions": '["adgroup_id"]',
        "metrics": '["spend", "conversion", "cost_per_conversion", "click", "cpc", "ctr"]',
        "data_level": "ADGROUP",
        "start_date": start_date,
        "end_date": end_date,
        "filtering": f'{{"adgroup_id":"{adgroup_ids_str}"}}',
        "page_size": 100
    }
    
    response = requests.get(endpoint, headers=headers, params=params)
    response.raise_for_status()
    data = response.json()
    
    if data.get("code") != 0:
        raise Exception(f"TikTok API error: {data.get('message')}")
    
    # Format the response data
    metrics_list = []
    for item in data.get("data", {}).get("list", []):
        # Extract adgroup_id from dimensions
        adgroup_id = None
        for dimension in item.get("dimensions", []):
            if dimension.get("adgroup_id"):
                adgroup_id = dimension.get("adgroup_id")
                break
                
        if not adgroup_id:
            continue
            
        # Create a dictionary for this adgroup with its metrics
        metrics_dict = {
            "advertiser_id": advertiser_id,
            "adgroup_id": adgroup_id,
            "date_range": f"{start_date} to {end_date}",
        }
        
        # Add all metrics
        metrics = item.get("metrics", {})
        for key, value in metrics.items():
            metrics_dict[key] = value
            
        metrics_list.append(metrics_dict)
    
    return metrics_list

def insert_get_metrics_rows(metrics_data: List[Dict[str, Any]]):
    """
    Insert metrics data into the get_metrics table in Supabase.
    """
    if not metrics_data:
        print("No metrics data to insert.")
        return
        
    endpoint = f"{SUPABASE_URL}/rest/v1/get_metrics"
    headers = {
        "apikey": SUPABASE_API_KEY,
        "Authorization": f"Bearer {SUPABASE_API_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }
    
    # Add status and created_at to each record
    current_time = datetime.utcnow().isoformat() + "Z"
    for record in metrics_data:
        record["status"] = "ENABLE"
        record["created_at"] = current_time
    
    response = requests.post(endpoint, headers=headers, json=metrics_data)
    response.raise_for_status()
    
    print(f"Successfully inserted {len(metrics_data)} metrics records.")
