from fastapi import FastAPI, APIRouter, HTTPException, Body
from pydantic import BaseModel
from typing import List, Optional, Dict
from datetime import datetime

from get_metrics import fetch_tiktok_metrics_for_adgroups, fetch_enabled_adgroups_from_supabase
from get_adgroups import fetch_tiktok_adgroups, upsert_adgroups_in_supabase
from automation import run_automation

app = FastAPI()
router = APIRouter()

class MetricsRequest(BaseModel):
    advertiser_id: str
    adgroup_ids: Optional[List[str]] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None

class AdvertiserIdRequest(BaseModel):
    advertiser_id: str

@router.get("/adgroups")
async def get_adgroups(advertiser_id: str):
    """
    Fetch ad groups from TikTok for the specified advertiser ID.
    """
    try:
        adgroups = fetch_tiktok_adgroups(advertiser_id)
        # Store in Supabase for later use
        upsert_adgroups_in_supabase(adgroups)
        return adgroups
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching ad groups: {str(e)}")

@router.post("/real-time-metrics")
async def get_real_time_metrics(request: MetricsRequest):
    """
    Fetch real-time metrics for specified ad groups or all enabled ad groups if none specified.
    """
    try:
        # If no start/end dates provided, use today
        if not request.start_date or not request.end_date:
            today = datetime.now().strftime("%Y-%m-%d")
            start_date = request.start_date or today
            end_date = request.end_date or today
        else:
            start_date = request.start_date
            end_date = request.end_date

        # If no adgroup_ids provided, fetch all enabled ones
        adgroup_ids = request.adgroup_ids
        if not adgroup_ids:
            adgroup_ids = fetch_enabled_adgroups_from_supabase(request.advertiser_id)
            if not adgroup_ids:
                return {"status": "success", "data": [], "message": "No enabled ad groups found"}

        # Fetch metrics from TikTok
        metrics = fetch_tiktok_metrics_for_adgroups(
            request.advertiser_id,
            adgroup_ids,
            start_date,
            end_date
        )
        
        return {
            "status": "success",
            "data": metrics,
            "count": len(metrics)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching metrics: {str(e)}")

@router.post("/send-notification")
async def send_notification(request: AdvertiserIdRequest = Body(...)):
    """
    Trigger the notification process for the given advertiser ID.
    This runs the same process as in main.py but as an API endpoint.
    """
    try:
        today = datetime.now().strftime("%Y-%m-%d")
        
        # Run the automation process
        run_automation(request.advertiser_id, today, today)
        
        return {
            "status": "success",
            "message": f"Notification process triggered for advertiser {request.advertiser_id}"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error sending notification: {str(e)}")

# Mount the router at the root
app.include_router(router, prefix="/api/advertiser")

# If you want to test this file directly
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
