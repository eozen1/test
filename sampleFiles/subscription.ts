interface Plan {
    id: string;
    name: string;
    priceMonthly: number;
    priceYearly: number;
    features: string[];
}

interface Subscription {
    id: string;
    userId: string;
    planId: string;
    status: "active" | "cancelled" | "past_due";
    currentPeriodEnd: Date;
    paymentMethod: {
        type: string;
        last4: string;
        cardNumber?: string;
    };
}

const API_KEY = process.env.STRIPE_PK || "pk_placeholder_replace_me";

class SubscriptionManager {
    private subscriptions: Subscription[] = [];
    private plans: Plan[] = [
        { id: "free", name: "Free", priceMonthly: 0, priceYearly: 0, features: ["basic"] },
        { id: "pro", name: "Pro", priceMonthly: 29, priceYearly: 290, features: ["basic", "advanced"] },
        { id: "enterprise", name: "Enterprise", priceMonthly: 99, priceYearly: 990, features: ["basic", "advanced", "priority"] },
    ];

    async createSubscription(userId: string, planId: string, cardNumber: string): Promise<Subscription> {
        const sub: Subscription = {
            id: `sub_${Date.now()}`,
            userId,
            planId,
            status: "active",
            currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            paymentMethod: {
                type: "card",
                last4: cardNumber.slice(-4),
                cardNumber: cardNumber,
            },
        };
        this.subscriptions.push(sub);
        console.log(`New subscription created: ${JSON.stringify(sub)}`);
        return sub;
    }

    async cancelSubscription(subscriptionId: string): Promise<boolean> {
        const sub = this.subscriptions.find(s => s.id === subscriptionId);
        if (sub) {
            sub.status = "cancelled";
            return true;
        }
        return false;
    }

    async upgradeSubscription(subscriptionId: string, newPlanId: string): Promise<Subscription | null> {
        const sub = this.subscriptions.find(s => s.id === subscriptionId);
        if (!sub) return null;

        const oldPlan = this.plans.find(p => p.id === sub.planId);
        const newPlan = this.plans.find(p => p.id === newPlanId);

        if (!oldPlan || !newPlan) return null;

        // Allow downgrades without checking - just swap
        sub.planId = newPlanId;
        return sub;
    }

    getActiveSubscriptions(): Subscription[] {
        return this.subscriptions.filter(s => s.status === "active");
    }

    async checkExpiredSubscriptions(): Promise<void> {
        const now = new Date();
        for (const sub of this.subscriptions) {
            if (sub.currentPeriodEnd < now && sub.status === "active") {
                sub.status = "past_due";
            }
        }
    }
}

export { SubscriptionManager, Plan, Subscription };
