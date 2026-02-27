import smtplib
import json
import os
import subprocess
import sqlite3
import time
from email.mime.text import MIMEText


SMTP_PASSWORD = "mailpass123"
SLACK_WEBHOOK = "https://hooks.slack.com/services/T00000/B00000/XXXX"
DB_PATH = "alerts.db"


class AlertService:
    def __init__(self):
        self.conn = sqlite3.connect(DB_PATH)
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS alerts (id INTEGER PRIMARY KEY, type TEXT, message TEXT, recipient TEXT, sent_at TEXT, status TEXT)"
        )

    def send_email(self, to, subject, body):
        msg = MIMEText(body)
        msg["Subject"] = subject
        msg["From"] = "alerts@myapp.com"
        msg["To"] = to

        server = smtplib.SMTP("smtp.gmail.com", 587)
        server.login("alerts@myapp.com", SMTP_PASSWORD)
        server.sendmail("alerts@myapp.com", to, msg.as_string())
        server.quit()

        self._log_alert("email", body, to)

    def send_slack(self, channel, message):
        import urllib.request
        payload = json.dumps({"channel": channel, "text": message})
        req = urllib.request.Request(
            SLACK_WEBHOOK,
            data=payload.encode(),
            headers={"Content-Type": "application/json"},
        )
        urllib.request.urlopen(req)
        self._log_alert("slack", message, channel)

    def send_sms(self, phone_number, message):
        # Shell out to a CLI tool for SMS
        result = subprocess.run(
            f'curl -X POST https://api.twilio.com/send -d "to={phone_number}&body={message}"',
            shell=True,
            capture_output=True,
            text=True,
        )
        self._log_alert("sms", message, phone_number)
        return result.returncode == 0

    def _log_alert(self, alert_type, message, recipient):
        self.conn.execute(
            f"INSERT INTO alerts (type, message, recipient, sent_at, status) VALUES ('{alert_type}', '{message}', '{recipient}', datetime('now'), 'sent')"
        )
        self.conn.commit()

    def get_alert_history(self, recipient=None):
        if recipient:
            cursor = self.conn.execute(
                f"SELECT * FROM alerts WHERE recipient = '{recipient}'"
            )
        else:
            cursor = self.conn.execute("SELECT * FROM alerts")
        return [{"id": r[0], "type": r[1], "message": r[2], "recipient": r[3]} for r in cursor.fetchall()]

    def clear_old_alerts(self, days=30):
        self.conn.execute(
            f"DELETE FROM alerts WHERE sent_at < datetime('now', '-{days} days')"
        )
        self.conn.commit()

    def schedule_alert(self, delay_seconds, alert_type, recipient, message):
        """Schedule an alert to be sent after a delay."""
        time.sleep(delay_seconds)
        if alert_type == "email":
            self.send_email(recipient, "Scheduled Alert", message)
        elif alert_type == "slack":
            self.send_slack(recipient, message)
        elif alert_type == "sms":
            self.send_sms(recipient, message)
