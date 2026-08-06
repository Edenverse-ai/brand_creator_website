import logging
import smtplib
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr

from fastapi import HTTPException

from ..config.settings import settings
from ..database.connection import supabase
from ..models.career import CareerApplicationData, CareerApplicationResponse

logger = logging.getLogger(__name__)


class CareerService:
    # Email configuration
    ADMIN_EMAIL = "sam@borderxai.com"
    HR_EMAIL = "info@borderxmedia.com"

    @staticmethod
    async def send_email(
        to_email: str, subject: str, html_content: str, from_email: str | None = None
    ) -> bool:
        """Send email using SMTP configuration."""
        try:
            if not all([settings.SMTP_USER, settings.SMTP_PASSWORD]):
                logger.error("SMTP configuration incomplete")
                return False

            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = formataddr(("Cricher.ai Careers", from_email or settings.SMTP_USER))
            msg["To"] = to_email

            html_part = MIMEText(html_content, "html")
            msg.attach(html_part)

            logger.info(f"Connecting to SMTP server: {settings.SMTP_HOST}:{settings.SMTP_PORT}")

            smtp_server: smtplib.SMTP_SSL | smtplib.SMTP
            if settings.SMTP_SECURE:
                smtp_server = smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT)
            else:
                smtp_server = smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT)
                smtp_server.starttls()

            smtp_server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            smtp_server.sendmail(settings.SMTP_USER, to_email, msg.as_string())
            smtp_server.quit()

            logger.info(f"Email sent successfully to {to_email}")
            return True

        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {str(e)}")
            return False

    @staticmethod
    def create_user_confirmation_email(application_data: CareerApplicationData) -> str:
        """Create HTML email template for applicant confirmation."""
        identity = application_data.identityInformation
        influencer = application_data.influencerInformation

        return f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Career Application Received - Cricher.ai</title>
            <style>
                body {{ font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }}
                .container {{ max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
                .header {{ background-color: #6d28d9; color: white; padding: 20px; margin: -30px -30px 30px -30px; border-radius: 8px 8px 0 0; text-align: center; }}
                .content {{ color: #1f2937; line-height: 1.6; }}
                .highlight {{ background-color: #f3f4f6; padding: 15px; border-radius: 6px; margin: 20px 0; }}
                .section {{ margin: 20px 0; }}
                .section-title {{ font-weight: bold; color: #6d28d9; margin-bottom: 10px; font-size: 16px; }}
                .field {{ margin: 8px 0; }}
                .field-label {{ font-weight: 600; color: #374151; }}
                .field-value {{ color: #1f2937; }}
                .footer {{ margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 12px; text-align: center; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1 style="margin: 0;">Application Received!</h1>
                    <p style="margin: 10px 0 0 0; opacity: 0.9;">Thank you for applying to Cricher.ai</p>
                </div>
                
                <div class="content">
                    <p>Dear {identity.passportName},</p>
                    
                    <p>Thank you for your interest in the <strong>{application_data.position}</strong> position at Cricher.ai! We have successfully received your application.</p>
                    
                    <div class="highlight">
                        <strong>Application Summary:</strong><br>
                        <strong>Position:</strong> {application_data.position}<br>
                        <strong>Submitted:</strong> {application_data.submittedAt}<br>
                        <strong>Application ID:</strong> {application_data.positionId}
                    </div>
                    
                    <div class="section">
                        <div class="section-title">Your Information</div>
                        <div class="field">
                            <span class="field-label">Name:</span> 
                            <span class="field-value">{identity.passportName}</span>
                        </div>
                        <div class="field">
                            <span class="field-label">Nationality:</span> 
                            <span class="field-value">{identity.nationality}</span>
                        </div>
                        <div class="field">
                            <span class="field-label">Profile URL:</span> 
                            <span class="field-value"><a href="{influencer.profileUrl}">{influencer.profileUrl}</a></span>
                        </div>
                        <div class="field">
                            <span class="field-label">Follower Count:</span> 
                            <span class="field-value">{influencer.followerCount}</span>
                        </div>
                    </div>
                    
                    <p><strong>What happens next?</strong></p>
                    <ul>
                        <li>Our HR team will review your application within 10 business days</li>
                        <li>If your profile matches our requirements, we'll contact you at <strong>{application_data.applicantEmail}</strong></li>
                        <li>Selected candidates will be invited for an interview</li>
                    </ul>
                    
                    <p>We appreciate your interest in joining our team and look forward to potentially working with you!</p>
                    
                    <p>Best regards,<br>
                    <strong>The Cricher.ai HR Team</strong></p>
                </div>
                
                <div class="footer">
                    <p>© {datetime.now().year} Cricher.ai. All rights reserved.</p>
                    <p>You're receiving this email because you applied for a position through our careers page.</p>
                </div>
            </div>
        </body>
        </html>
        """

    @staticmethod
    async def store_application(application_data: CareerApplicationData) -> str | None:
        """Store career application in Supabase database."""
        try:
            if not supabase:
                logger.warning("Supabase not available, skipping database storage")
                return None

            identity = application_data.identityInformation
            influencer = application_data.influencerInformation

            application_record = {
                "position": application_data.position,
                "position_id": application_data.positionId,
                "applicant_email": application_data.applicantEmail,
                "passport_name": identity.passportName,
                "nationality": identity.nationality,
                "id_type": identity.idType,
                "id_number": identity.idNumber,
                "gender": identity.gender,
                "date_of_birth": identity.dateOfBirth,
                "account_intro": influencer.accountIntroduction,
                "profile_url": influencer.profileUrl,
                "follower_count": influencer.followerCount,
                "other_platforms": influencer.otherPlatforms,
                "status": "new",
                "created_at": application_data.submittedAt,
            }

            logger.info(
                f"Storing career application in database: {application_data.applicantEmail}"
            )

            response = supabase.table("CareerApplications").insert(application_record).execute()

            if response.data and len(response.data) > 0:
                app_id = response.data[0]["id"]
                logger.info(f"Career application stored successfully with ID: {app_id}")
                return str(app_id)
            else:
                logger.error("Failed to store career application - no data returned")
                return None

        except Exception as e:
            logger.error(f"Error storing career application in database: {str(e)}")
            return None

    @staticmethod
    async def submit_career_application(
        application_data: CareerApplicationData,
    ) -> CareerApplicationResponse:
        """Submit a career application with email notification."""
        try:
            logger.info(
                f"Received career application from {application_data.applicantEmail} for {application_data.position}"
            )

            # Store in database
            stored_app_id = await CareerService.store_application(application_data)
            database_stored = stored_app_id is not None

            # Send confirmation email to applicant
            user_html = CareerService.create_user_confirmation_email(application_data)
            user_subject = f"Application Received - {application_data.position} at Cricher.ai"

            email_sent = await CareerService.send_email(
                to_email=application_data.applicantEmail,
                subject=user_subject,
                html_content=user_html,
            )

            if not email_sent:
                logger.error("Failed to send applicant confirmation email")

            app_id = (
                stored_app_id
                or f"app-{application_data.positionId}-{int(datetime.now().timestamp())}"
            )
            response_message = (
                "Thank you for your application! We've sent a confirmation to your email."
            )

            logger.info(
                f"Career application processing complete - ID: {app_id}, DB Stored: {database_stored}, Email Sent: {email_sent}"
            )

            return CareerApplicationResponse(
                success=True,
                message=response_message,
                application_id=app_id,
                stored_in_database=database_stored,
            )

        except Exception as e:
            logger.error(f"Error processing career application: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail="Failed to submit career application. Please try again later.",
            )
