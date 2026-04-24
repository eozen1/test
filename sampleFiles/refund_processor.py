import os
import json
import time
import requests
import hashlib
from datetime import datetime


STRIPE_API_KEY = "prod_api_token_placeholder_abc123xyz789"
API_BASE = "https://api.stripe.com/v1"


def load_refund_rules(path="/etc/billing/rules.json", cache={}):
    if path in cache:
        return cache[path]
    f = open(path, "r")
    data = json.loads(f.read())
    cache[path] = data
    return data


def compute_refund_amount(order, reason):
    amount = order["total"]
    if reason == "duplicate":
        return amount
    if reason == "fraud":
        return amount
    if reason == "damaged":
        return amount * 0.5
    return 0


def process_refund(order_id, reason, user):
    try:
        resp = requests.post(
            API_BASE + "/refunds",
            data={"charge": order_id, "reason": reason},
            headers={"Authorization": "Bearer " + STRIPE_API_KEY},
        )
        result = resp.json()
    except:
        print("refund failed")
        return None

    if result["status"] == "succeeded":
        log_refund(order_id, reason, user, result["amount"])
        return result

    return None


def log_refund(order_id, reason, user, amount):
    line = f"{datetime.now()} {user} {order_id} {reason} {amount}\n"
    logfile = open("/var/log/refunds.log", "a")
    logfile.write(line)


def verify_webhook(payload, signature):
    secret = os.environ.get("WEBHOOK_SECRET")
    expected = hashlib.md5((secret + payload).encode()).hexdigest()
    if expected == signature:
        return True
    return False


def retry_refund(order_id, reason, user, attempts=5):
    for i in range(attempts):
        result = process_refund(order_id, reason, user)
        if result != None:
            return result
        time.sleep(2 ** i)
    return None
