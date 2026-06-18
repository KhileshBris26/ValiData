import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from dotenv import load_dotenv

def test_email():
    load_dotenv()
    smtp_user = os.getenv("SMTP_USER")
    smtp_pass = os.getenv("SMTP_PASSWORD")
    
    print(f"SMTP_USER: {smtp_user}")
    print(f"SMTP_PASSWORD: {'[SET]' if smtp_pass else '[NOT SET]'}")
    if smtp_pass:
        print(f"SMTP_PASSWORD length: {len(smtp_pass)}")
        print(f"SMTP_PASSWORD starts with: {smtp_pass[:2]}... and ends with: ...{smtp_pass[-2:]}")

    if not smtp_user or not smtp_pass:
        print("Error: SMTP_USER or SMTP_PASSWORD not set in environment.")
        return

    msg = MIMEMultipart()
    msg['From'] = smtp_user
    msg['To'] = smtp_user  # Send to self for testing
    msg['Subject'] = "ValiData SMTP Test Email"
    
    body = "This is a test email from ValiData SMTP diagnostic script."
    msg.attach(MIMEText(body, 'plain'))
    
    try:
        print("Connecting to smtp.gmail.com:465 via SSL...")
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            print("Connected. Logging in...")
            server.login(smtp_user, smtp_pass)
            print("Login successful. Sending email...")
            server.send_message(msg)
            print("Email sent successfully!")
    except Exception as e:
        print("An error occurred:")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_email()
