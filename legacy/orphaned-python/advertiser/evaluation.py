# File: evaluation.py
import requests
import json
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from datetime import datetime

SUPABASE_URL = "https://jmbibmulwznrgtrkwrxk.supabase.co"
SUPABASE_API_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptYmlibXVsd3pucmd0cmt3cnhrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MDY4MzI4NywiZXhwIjoyMDU2MjU5Mjg3fQ.1j61oj07IGEa_pTPilCmHAZ3XrQkIRSZjrNh0GrkgjQ" 
ALERT_THRESHOLD_CPC = 1.0

SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
EMAIL_ADDRESS = "rucheng@borderxai.com"
EMAIL_PASSWORD = "fejbwneomobqycrq"
ALERT_RECIPIENT = "timbymchale05@gmail.com"

def fetch_active_metrics_for_advertiser(advertiser_id: str):
    """
    Fetch all rows in get_metrics for this advertiser where:
        - status=ENABLE
        - alert_id IS NULL
    Then group by adgroup_id, pick the row with the largest created_at.
    """
    endpoint = f"{SUPABASE_URL}/rest/v1/get_metrics"
    headers = {
        "apikey": SUPABASE_API_KEY,
        "Authorization": f"Bearer {SUPABASE_API_KEY}",
        "Content-Type": "application/json"
    }

    params = {
        "select": "*",
        "advertiser_id": f"eq.{advertiser_id}",
        "status": "eq.ENABLE",
        "alert_id": "is.null"
    }

    response = requests.get(endpoint, headers=headers, params=params)
    response.raise_for_status()
    rows = response.json()

    # Group by adgroup_id, find row with latest created_at
    latest_by_adgroup = {}
    for row in rows:
        adgroup_id = row.get("adgroup_id")
        created_at_str = row.get("created_at")
        if not created_at_str or not adgroup_id:
            continue

        created_at_dt = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
        if adgroup_id not in latest_by_adgroup:
            latest_by_adgroup[adgroup_id] = (row, created_at_dt)
        else:
            _, existing_dt = latest_by_adgroup[adgroup_id]
            if created_at_dt > existing_dt:
                latest_by_adgroup[adgroup_id] = (row, created_at_dt)

    return [pair[0] for pair in latest_by_adgroup.values()]


def insert_alert(adgroup_id: str, cost_per_conversion: float, message: str):
    """
    Insert a new row into 'alerts' table to log the alert.
    Return the inserted row so we can get 'id'.
    """
    endpoint = f"{SUPABASE_URL}/rest/v1/alerts"
    headers = {
        "apikey": SUPABASE_API_KEY,
        "Authorization": f"Bearer {SUPABASE_API_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"  # So we get the inserted row back
    }
    now_iso = datetime.utcnow().isoformat()

    payload = [{
        "adgroup_id": adgroup_id,
        "cost_per_conversion": cost_per_conversion,
        "trigger_time": now_iso,
        "message": message
    }]

    resp = requests.post(endpoint, headers=headers, data=json.dumps(payload))
    resp.raise_for_status()
    inserted_rows = resp.json()
    return inserted_rows[0]

def update_get_metrics(row_id: int, alert_id: int):
    """
    Patch 'get_metrics' row to set alert_id and status=DISABLE (so we don't alert again).
    """
    endpoint = f"{SUPABASE_URL}/rest/v1/get_metrics?id=eq.{row_id}"
    headers = {
        "apikey": SUPABASE_API_KEY,
        "Authorization": f"Bearer {SUPABASE_API_KEY}",
        "Content-Type": "application/json"
    }
    payload = {
        "alert_id": alert_id,
        "status": "DISABLE"
    }

    resp = requests.patch(endpoint, headers=headers, data=json.dumps(payload))
    resp.raise_for_status()
    print(f"Updated get_metrics row {row_id} → alert_id={alert_id}, status=DISABLE")


def send_email_alert(subject: str, body: str):
    """
    Sends an email via SMTP. 
    """
    msg = MIMEMultipart()
    msg["From"] = EMAIL_ADDRESS
    msg["To"] = ALERT_RECIPIENT
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))

    try:
        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()
        server.login(EMAIL_ADDRESS, EMAIL_PASSWORD)
        server.send_message(msg)
        server.quit()
        print("Email alert sent successfully to", ALERT_RECIPIENT)
    except Exception as e:
        print("Failed to send email:", e)


def check_most_recent_metrics(advertiser_id: str):
    """
    1. Pull the latest 'ENABLE' records from get_metrics where alert_id is null.
    2. If cost_per_conversion > threshold, create alert + update row + send email.
    """
    rows = fetch_active_metrics_for_advertiser(advertiser_id)
    if not rows:
        print(f"No active (ENABLE) rows for advertiser {advertiser_id}")
        return

    for row in rows:
        row_id = row.get("id")
        adgroup_id = row.get("adgroup_id")
        cpc = row.get("cost_per_conversion", 0.0)
        if isinstance(cpc, str):
            cpc = float(cpc)

        if cpc > ALERT_THRESHOLD_CPC:
            msg = f"AdGroup {adgroup_id} has CPC={cpc:.2f} > {ALERT_THRESHOLD_CPC}"
            alert = insert_alert(adgroup_id, cpc, msg)
            alert_id = alert["id"]

            # Update original get_metrics row
            update_get_metrics(row_id, alert_id)
            # Send email
            send_email_alert(f"[ALERT] CPC Exceeded for {adgroup_id}", msg)
        else:
            print(f"AdGroup {adgroup_id} is within CPC threshold: {cpc:.2f} <= {ALERT_THRESHOLD_CPC}")
