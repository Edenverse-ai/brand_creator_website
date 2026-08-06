# File: automation.py
from get_adgroups import fetch_tiktok_adgroups, upsert_adgroups_in_supabase
from get_metrics import fetch_enabled_adgroups_from_supabase, fetch_tiktok_metrics_for_adgroups, insert_get_metrics_rows
from evaluation import check_most_recent_metrics

def run_automation(advertiser_id: str, start_date: str, end_date: str):
    """
    1) Upsert current ad group data from TikTok into omgbeautybox_new
    2) Get all 'ENABLE' ad groups from omgbeautybox_new
    3) Fetch metrics for them + insert into get_metrics
    4) Evaluate for CPC threshold + send alerts
    """
    # Step 1: fetch from TikTok, upsert to Supabase
    adgroups = fetch_tiktok_adgroups(advertiser_id)
    upsert_adgroups_in_supabase(adgroups)

    # Step 2: fetch enable adgroup_ids
    enable_adgroup_ids = fetch_enabled_adgroups_from_supabase(advertiser_id)
    if not enable_adgroup_ids:
        print("No ENABLE adgroups found, skipping metrics + evaluation.")
        return

    # Step 3: fetch metrics + insert
    tiktok_metrics = fetch_tiktok_metrics_for_adgroups(
        advertiser_id,
        enable_adgroup_ids,
        start_date,
        end_date
    )
    insert_get_metrics_rows(tiktok_metrics)

    # Step 4: evaluate CPC threshold
    check_most_recent_metrics(advertiser_id)
