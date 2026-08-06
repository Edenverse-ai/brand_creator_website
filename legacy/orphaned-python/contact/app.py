from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
import logging
import smtplib
import os
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.utils import formataddr

# Add Supabase imports
from supabase import create_client, Client

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI app for contact
contact_app = FastAPI(title="Contact API", version="1.0.0")

# Add CORS middleware
contact_app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://cricher.ai",
        "https://www.cricher.ai", 
        "http://localhost:3000",  # For local development
        "http://127.0.0.1:3000"   # Alternative localhost
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Supabase client (reuse from campaigns API)
supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_SERVICE_KEY")

# Initialize Supabase client
if supabase_url and supabase_key:
    try:
        supabase = create_client(supabase_url, supabase_key)
        logger.info("Supabase client initialized successfully for contact API")
    except Exception as e:
        logger.error(f"Failed to initialize Supabase client: {str(e)}")
        supabase = None
else:
    logger.warning("Supabase credentials not found, database storage will be disabled")
    supabase = None

# Email configuration from environment variables
SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_SECURE = os.environ.get("SMTP_SECURE", "false").lower() == "true"
SMTP_USER = os.environ.get("SMTP_USER")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD")

# Default email addresses
ADMIN_EMAIL = "sam@borderxai.com"  # Where contact form submissions go
SUPPORT_EMAIL = "info@borderxmedia.com"  # From address for confirmations

# Pydantic models for contact form
class ContactFormData(BaseModel):
    name: str
    email: EmailStr
    subject: str
    message: str
    timestamp: Optional[datetime] = None
    
    class Config:
        # Allow automatic timestamp generation
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }

class ContactResponse(BaseModel):
    success: bool
    message: str
    contact_id: Optional[str] = None
    stored_in_database: Optional[bool] = None

# Email sending function
async def send_email(to_email: str, subject: str, html_content: str, from_email: str = None) -> bool:
    """Send email using SMTP configuration."""
    try:
        # Validate SMTP configuration
        if not all([SMTP_USER, SMTP_PASSWORD]):
            logger.error("SMTP configuration incomplete. Missing SMTP_USER or SMTP_PASSWORD")
            return False
        
        # Create message
        msg = MIMEMultipart('alternative')
        msg['Subject'] = subject
        msg['From'] = formataddr(("Brand Creator Platform", from_email or SMTP_USER))
        msg['To'] = to_email
        
        # Create HTML part
        html_part = MIMEText(html_content, 'html')
        msg.attach(html_part)
        
        # Connect to server and send email
        logger.info(f"Connecting to SMTP server: {SMTP_HOST}:{SMTP_PORT}")
        
        if SMTP_SECURE:
            # Use SSL
            server = smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT)
        else:
            # Use TLS
            server = smtplib.SMTP(SMTP_HOST, SMTP_PORT)
            server.starttls()
        
        server.login(SMTP_USER, SMTP_PASSWORD)
        
        # Send email
        text = msg.as_string()
        server.sendmail(SMTP_USER, to_email, text)
        server.quit()
        
        logger.info(f"Email sent successfully to {to_email}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to send email to {to_email}: {str(e)}")
        return False

# ✅ ADMIN NOTIFICATION EMAIL TEMPLATE (you receive this)
def create_admin_notification_email(contact_data: ContactFormData, contact_id: Optional[str] = None) -> str:
    """Create HTML email template for admin notification with database reference."""
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>New Contact Form Submission</title>
        <style>
            body {{ font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }}
            .container {{ max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
            .header {{ background-color: #6d28d9; color: white; padding: 20px; margin: -30px -30px 30px -30px; border-radius: 8px 8px 0 0; }}
            .field {{ margin-bottom: 20px; }}
            .label {{ font-weight: bold; color: #374151; margin-bottom: 5px; }}
            .value {{ color: #1f2937; line-height: 1.5; }}
            .message {{ background-color: #f9fafb; padding: 15px; border-left: 4px solid #6d28d9; border-radius: 4px; }}
            .footer {{ margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px; }}
            .reference {{ background-color: #e0e7ff; padding: 10px; border-radius: 4px; margin-bottom: 20px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1 style="margin: 0;">New Contact Form Submission</h1>
                <p style="margin: 5px 0 0 0; opacity: 0.9;">Brand Creator Platform</p>
            </div>
            
            {f'<div class="reference"><strong>Reference ID:</strong> {contact_id}</div>' if contact_id else ''}
            
            <div class="field">
                <div class="label">Name:</div>
                <div class="value">{contact_data.name}</div>
            </div>
            
            <div class="field">
                <div class="label">Email:</div>
                <div class="value"><a href="mailto:{contact_data.email}">{contact_data.email}</a></div>
            </div>
            
            <div class="field">
                <div class="label">Subject:</div>
                <div class="value">{contact_data.subject}</div>
            </div>
            
            <div class="field">
                <div class="label">Message:</div>
                <div class="message">{contact_data.message.replace(chr(10), '<br>')}</div>
            </div>
            
            <div class="field">
                <div class="label">Submitted:</div>
                <div class="value">{contact_data.timestamp.strftime('%Y-%m-%d %H:%M:%S UTC') if contact_data.timestamp else 'Unknown'}</div>
            </div>
            
            <div class="footer">
                <p>This message was sent from the Brand Creator Platform contact form.</p>
                <p>Reply directly to this email to respond to {contact_data.name}.</p>
                {f'<p>Database Reference: Contact ID #{contact_id}</p>' if contact_id else '<p>Note: Message was not stored in database.</p>'}
            </div>
        </div>
    </body>
    </html>
    """

# ✅ USER CONFIRMATION EMAIL TEMPLATE (customer receives this)
def create_user_confirmation_email(contact_data: ContactFormData) -> str:
    """Create HTML email template for user confirmation."""
    return f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Thank You for Contacting Us</title>
        <style>
            body {{ font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }}
            .container {{ max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
            .header {{ background-color: #6d28d9; color: white; padding: 20px; margin: -30px -30px 30px -30px; border-radius: 8px 8px 0 0; text-align: center; }}
            .content {{ color: #1f2937; line-height: 1.6; }}
            .highlight {{ background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin: 20px 0; }}
            .contact-info {{ background-color: #fef3c7; padding: 15px; border-radius: 6px; margin: 20px 0; }}
            .footer {{ margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px; text-align: center; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1 style="margin: 0;">Thank You!</h1>
                <p style="margin: 10px 0 0 0; opacity: 0.9;">We've received your message</p>
            </div>
            
            <div class="content">
                <p>Hi {contact_data.name},</p>
                
                <p>Thank you for contacting Brand Creator Platform! We've successfully received your message and appreciate you taking the time to reach out to us.</p>
                
                <div class="highlight">
                    <strong>Your Message Summary:</strong><br>
                    <strong>Subject:</strong> {contact_data.subject}<br>
                    <strong>Submitted:</strong> {contact_data.timestamp.strftime('%Y-%m-%d %H:%M:%S UTC') if contact_data.timestamp else 'Just now'}
                </div>
                
                <p><strong>What happens next?</strong></p>
                <ul>
                    <li>Our team will review your message within 24 hours</li>
                    <li>We'll respond to you at <strong>{contact_data.email}</strong></li>
                    <li>For urgent matters, you can also reach us directly at the contact information below</li>
                </ul>
                
                <div class="contact-info">
                    <strong>Other ways to reach us:</strong><br>
                    📧 Support: info@borderxmedia.com<br>
                    📧 Business Inquiries: sam@borderxmedia.com<br>
                    🌐 Website: https://cricher.ai
                </div>
                
                <p>In the meantime, feel free to explore our platform and discover the exciting opportunities available for creators and brands!</p>
                
                <p>Best regards,<br>
                <strong>The Brand Creator Platform Team</strong></p>
            </div>
            
            <div class="footer">
                <p>© {datetime.now().year} Brand Creator Platform. All rights reserved.</p>
                <p>You're receiving this email because you contacted us through our website.</p>
            </div>
        </div>
    </body>
    </html>
    """

# Database storage function
async def store_contact_message(contact_data: ContactFormData) -> Optional[str]:
    """Store contact message in Supabase database."""
    try:
        if not supabase:
            logger.warning("Supabase not available, skipping database storage")
            return None
        
        # Prepare data for database insertion
        contact_record = {
            "name": contact_data.name,
            "email": contact_data.email,
            "subject": contact_data.subject,
            "message": contact_data.message,
            "status": "new",  # Default status for new messages
            "created_at": contact_data.timestamp.isoformat() if contact_data.timestamp else datetime.now().isoformat()
        }
        
        logger.info(f"Storing contact message in database: {contact_data.email}")
        
        # Insert into Contact table (capital C)
        response = supabase.table('Contact').insert(contact_record).execute()
        
        if response.data and len(response.data) > 0:
            contact_id = response.data[0]['id']
            logger.info(f"Contact message stored successfully with ID: {contact_id}")
            return str(contact_id)
        else:
            logger.error("Failed to store contact message - no data returned")
            return None
            
    except Exception as e:
        logger.error(f"Error storing contact message in database: {str(e)}")
        return None

# Contact form submission endpoint
@contact_app.post("/submit", response_model=ContactResponse)
async def submit_contact_form(
    request: Request,
    contact_data: ContactFormData
):
    """Submit a contact form with enhanced database handling."""
    try:
        logger.info(f"Received contact form submission from {contact_data.email}")
        
        # Set timestamp if not provided
        if not contact_data.timestamp:
            contact_data.timestamp = datetime.now()
        
        # Log the contact form data
        logger.info(f"Contact Form Data: Name={contact_data.name}, Email={contact_data.email}, Subject={contact_data.subject}")
        logger.info(f"Message preview: {contact_data.message[:100]}...")
        
        # Try to store in database
        stored_contact_id = await store_contact_message(contact_data)
        database_stored = stored_contact_id is not None
        
        # Send email notifications regardless of database storage success
        email_success = True
        
        # 1. Send notification to admin
        admin_html = create_admin_notification_email(contact_data, stored_contact_id)
        admin_subject = f"New Contact Form: {contact_data.subject}"
        
        admin_sent = await send_email(
            to_email=ADMIN_EMAIL,
            subject=admin_subject,
            html_content=admin_html
        )
        
        if not admin_sent:
            logger.error("Failed to send admin notification email")
            email_success = False
        
        # 2. Send confirmation to user
        user_html = create_user_confirmation_email(contact_data)
        user_subject = "Thank you for contacting Brand Creator Platform"
        
        user_sent = await send_email(
            to_email=contact_data.email,
            subject=user_subject,
            html_content=user_html,
            from_email=SUPPORT_EMAIL
        )
        
        if not user_sent:
            logger.error("Failed to send user confirmation email")
            email_success = False
        
        # Generate contact ID
        contact_id = stored_contact_id or f"contact-{int(contact_data.timestamp.timestamp())}"
        
        # Always return clean success message for frontend
        response_message = "Thank you for your message! We'll get back to you soon."
        
        logger.info(f"Contact form processing complete - ID: {contact_id}, DB Stored: {database_stored}, Emails Sent: {email_success}")
        
        return ContactResponse(
            success=True,
            message=response_message,
            contact_id=contact_id,
            stored_in_database=database_stored
        )
        
    except Exception as e:
        logger.error(f"Error processing contact form: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to submit contact form. Please try again later."
        )

# Health check endpoint
@contact_app.get("/health")
async def contact_health_check():
    """Health check for contact API including database status."""
    database_status = "connected" if supabase else "unavailable"
    
    # Test database connection if available
    if supabase:
        try:
            test_response = supabase.table('Contact').select('id').limit(1).execute()
            database_status = "connected"
        except Exception as e:
            database_status = f"error: {str(e)}"
    
    return {
        "status": "ok",
        "service": "contact_api",
        "timestamp": datetime.now().isoformat(),
        "database": database_status,
        "email_configured": all([SMTP_USER, SMTP_PASSWORD])
    }

# Get contact form schema (useful for frontend validation)
@contact_app.get("/schema")
async def get_contact_form_schema():
    """Return the contact form schema for frontend validation."""
    return {
        "fields": {
            "name": {"type": "string", "required": True, "min_length": 1},
            "email": {"type": "email", "required": True},
            "subject": {"type": "string", "required": True, "min_length": 1},
            "message": {"type": "string", "required": True, "min_length": 10},
            "timestamp": {"type": "datetime", "required": False, "auto_generated": True}
        },
        "validation_rules": {
            "name": "Must not be empty",
            "email": "Must be a valid email address",
            "subject": "Must not be empty", 
            "message": "Must be at least 10 characters long"
        }
    }

# Add email test endpoint
@contact_app.post("/test-email")
async def test_email_configuration():
    """Test email configuration by sending a test email."""
    try:
        test_html = """
        <h2>Email Configuration Test</h2>
        <p>If you receive this email, your SMTP configuration is working correctly!</p>
        <p>Timestamp: {}</p>
        """.format(datetime.now().isoformat())
        
        success = await send_email(
            to_email=SMTP_USER,  # Send to yourself
            subject="Brand Creator Platform - Email Test",
            html_content=test_html
        )
        
        return {
            "success": success,
            "message": "Test email sent successfully" if success else "Failed to send test email",
            "smtp_configured": all([SMTP_USER, SMTP_PASSWORD]),
            "smtp_host": SMTP_HOST,
            "smtp_port": SMTP_PORT
        }
        
    except Exception as e:
        logger.error(f"Email test failed: {str(e)}")
        return {
            "success": False,
            "message": f"Email test failed: {str(e)}",
            "smtp_configured": all([SMTP_USER, SMTP_PASSWORD])
        }

# Add database management endpoints
@contact_app.get("/messages")
async def get_contact_messages(
    status: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
):
    """Get contact messages from database (admin only)."""
    try:
        if not supabase:
            return {"error": "Database not available"}
        
        query = supabase.table('Contact').select('*')
        
        if status:
            query = query.eq('status', status)
        
        query = query.order('created_at', desc=True).range(offset, offset + limit - 1)
        
        response = query.execute()
        
        return {
            "success": True,
            "messages": response.data or [],
            "count": len(response.data or [])
        }
        
    except Exception as e:
        logger.error(f"Error fetching contact messages: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch messages")

@contact_app.patch("/messages/{message_id}/status")
async def update_message_status(
    message_id: int,
    status: str
):
    """Update the status of a contact message."""
    try:
        if not supabase:
            return {"error": "Database not available"}
        
        # Validate status
        valid_statuses = ['new', 'in_progress', 'replied', 'resolved', 'spam']
        if status not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
        
        # Update message status
        response = supabase.table('Contact').update({'status': status}).eq('id', message_id).execute()
        
        if response.data:
            logger.info(f"Updated contact message {message_id} status to {status}")
            return {"success": True, "message_id": message_id, "status": status}
        else:
            raise HTTPException(status_code=404, detail="Message not found")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating message status: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update message status")
