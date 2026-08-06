# File: main.py
import schedule
import time
from datetime import datetime

from automation import run_automation
# Import the new API endpoints so they're available when this module is imported
from api_endpoints import router as advertiser_api_router

def run_daily_metrics():
    """
    1) Use today's date as both start_date and end_date.
    2) Call run_automation for a fixed advertiser_id 
       (or loop over multiple advertiser IDs if needed).
    """
    today_str = datetime.now().strftime("%Y-%m-%d")
    advertiser_id = "7385681808811294736"  # or any fixed ID

    print(f"Running automation for advertiser_id={advertiser_id}, date_range={today_str} to {today_str}")
    run_automation(advertiser_id, today_str, today_str)
    print("Process complete.\n")

def main():
    """
    Schedule run_daily_metrics() to run once every hour indefinitely.
    """
    # Run immediately once at startup (optional)
    run_daily_metrics()

    # Schedule it to run every hour
    schedule.every().hour.do(run_daily_metrics)

    print("Hourly schedule set up. Press Ctrl+C to exit.")
    # Loop forever, checking the schedule
    while True:
        schedule.run_pending()
        time.sleep(1)

if __name__ == "__main__":
    main()
