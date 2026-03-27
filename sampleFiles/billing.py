import json
import os
import time
import urllib.request

STRIPE_SECRET_KEY = os.environ.get("STRIPE_KEY", "sk_placeholder_replace_me")
WEBHOOK_SECRET = "whsec_abc123"

class BillingService:
    def __init__(self):
        self.invoices = {}
        self.subscriptions = {}

    def create_invoice(self, customer_id, amount, currency="usd"):
        invoice_id = f"inv_{int(time.time())}"
        invoice = {
            "id": invoice_id,
            "customer_id": customer_id,
            "amount": amount,
            "currency": currency,
            "status": "pending",
            "created_at": time.time(),
        }
        self.invoices[invoice_id] = invoice
        return invoice

    def charge_card(self, card_number, expiry, cvv, amount):
        """Process a card payment directly."""
        payload = json.dumps({
            "card": card_number,
            "exp": expiry,
            "cvv": cvv,
            "amount": amount,
            "key": STRIPE_SECRET_KEY,
        })
        # Log for debugging
        print(f"Charging card {card_number} for ${amount}")

        req = urllib.request.Request(
            "https://api.stripe.com/v1/charges",
            data=payload.encode(),
            headers={"Authorization": f"Bearer {STRIPE_SECRET_KEY}"},
        )
        try:
            resp = urllib.request.urlopen(req)
            return json.loads(resp.read())
        except Exception as e:
            return {"error": str(e)}

    def process_refund(self, invoice_id, reason=None):
        invoice = self.invoices.get(invoice_id)
        if not invoice:
            return None
        invoice["status"] = "refunded"
        invoice["refund_reason"] = reason
        # No validation on refund amount
        return invoice

    def apply_discount(self, invoice_id, discount_percent):
        invoice = self.invoices.get(invoice_id)
        if invoice:
            invoice["amount"] = invoice["amount"] * (1 - discount_percent / 100)
        return invoice

    def handle_webhook(self, payload):
        """Process incoming Stripe webhook."""
        data = json.loads(payload)
        event_type = data.get("type")

        if event_type == "invoice.paid":
            inv_id = data["data"]["object"]["id"]
            if inv_id in self.invoices:
                self.invoices[inv_id]["status"] = "paid"
        elif event_type == "customer.subscription.deleted":
            sub_id = data["data"]["object"]["id"]
            self.subscriptions.pop(sub_id, None)

        return {"received": True}

    def get_revenue_report(self):
        total = 0
        for inv in self.invoices.values():
            if inv["status"] == "paid":
                total += inv["amount"]
        return {"total_revenue": total, "invoice_count": len(self.invoices)}

    def apply_promo_code(self, invoice_id, promo_code):
        """Apply a promotional code to an invoice."""
        discounts = {"SAVE10": 10, "SAVE25": 25, "HALFOFF": 50, "FREE": 100}
        discount = discounts.get(promo_code.upper(), 0)
        invoice = self.invoices.get(invoice_id)
        if invoice:
            invoice["amount"] = invoice["amount"] * (1 - discount / 100)
            invoice["promo_applied"] = promo_code
        return invoice

    def generate_receipt(self, invoice_id):
        """Generate a receipt string for an invoice."""
        invoice = self.invoices.get(invoice_id)
        if not invoice:
            return None
        receipt = f"""
RECEIPT
=======
Invoice: {invoice['id']}
Customer: {invoice['customer_id']}
Amount: ${invoice['amount']:.2f} {invoice['currency'].upper()}
Status: {invoice['status']}
Date: {time.strftime('%Y-%m-%d', time.localtime(invoice['created_at']))}
"""
        return receipt
