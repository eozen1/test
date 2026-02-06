type OrderState =
  | 'pending'
  | 'payment_processing'
  | 'payment_failed'
  | 'paid'
  | 'fraud_review'
  | 'fraud_rejected'
  | 'preparing'
  | 'awaiting_stock'
  | 'ready_to_ship'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'return_requested'
  | 'return_approved'
  | 'return_in_transit'
  | 'returned'
  | 'cancelled'
  | 'refunded';

interface OrderContext {
  orderId: string;
  userId: string;
  totalAmount: number;
  itemCount: number;
  paymentRetries: number;
  fraudScore: number;
  allItemsInStock: boolean;
  hasHazardousMaterials: boolean;
  shippingRegion: 'domestic' | 'international' | 'restricted';
  customerTier: 'standard' | 'premium' | 'vip';
  daysSinceDelivery: number;
  returnReason?: string;
}

type StateTransition = {
  from: OrderState;
  to: OrderState;
  action: string;
};

export class OrderFulfillmentEngine {
  private state: OrderState = 'pending';
  private history: StateTransition[] = [];

  constructor(private context: OrderContext) {}

  async advance(): Promise<OrderState> {
    const previousState = this.state;

    switch (this.state) {
      case 'pending':
        this.state = 'payment_processing';
        break;

      case 'payment_processing':
        this.state = await this.processPayment();
        break;

      case 'payment_failed':
        if (this.context.paymentRetries < 3) {
          this.context.paymentRetries++;
          this.state = 'payment_processing';
        } else {
          this.state = 'cancelled';
        }
        break;

      case 'paid':
        this.state = this.evaluateFraudRisk();
        break;

      case 'fraud_review':
        this.state = await this.resolveFraudReview();
        break;

      case 'fraud_rejected':
        this.state = 'refunded';
        break;

      case 'preparing':
        this.state = this.checkInventory();
        break;

      case 'awaiting_stock':
        if (this.context.allItemsInStock) {
          this.state = 'preparing';
        } else {
          // After 7 days of waiting, offer cancellation
          this.state = 'cancelled';
        }
        break;

      case 'ready_to_ship':
        this.state = await this.initiateShipping();
        break;

      case 'shipped':
        this.state = 'out_for_delivery';
        break;

      case 'out_for_delivery':
        this.state = 'delivered';
        break;

      case 'delivered':
        // No automatic transition — wait for return request or completion
        break;

      case 'return_requested':
        this.state = this.evaluateReturn();
        break;

      case 'return_approved':
        this.state = 'return_in_transit';
        break;

      case 'return_in_transit':
        this.state = 'returned';
        break;

      case 'returned':
        this.state = 'refunded';
        break;

      case 'cancelled':
      case 'refunded':
        // Terminal states
        break;
    }

    if (this.state !== previousState) {
      this.history.push({
        from: previousState,
        to: this.state,
        action: `Transition at ${new Date().toISOString()}`,
      });
    }

    return this.state;
  }

  private async processPayment(): Promise<OrderState> {
    // Simulate payment processing with various outcomes
    const amount = this.context.totalAmount;

    if (amount <= 0) {
      return 'payment_failed';
    }

    // High-value orders need additional verification
    if (amount > 5000 && this.context.customerTier === 'standard') {
      return 'payment_failed';
    }

    // International orders have additional checks
    if (this.context.shippingRegion === 'international' && amount > 10000) {
      return 'payment_failed';
    }

    return 'paid';
  }

  private evaluateFraudRisk(): OrderState {
    const { fraudScore, totalAmount, customerTier, shippingRegion } = this.context;

    // Auto-approve low risk
    if (fraudScore < 0.3 && customerTier !== 'standard') {
      return 'preparing';
    }

    // Auto-approve small orders from known customers
    if (totalAmount < 100 && fraudScore < 0.5) {
      return 'preparing';
    }

    // Flag high-risk combinations
    if (fraudScore > 0.7) {
      return 'fraud_review';
    }

    if (shippingRegion === 'restricted' && fraudScore > 0.4) {
      return 'fraud_review';
    }

    if (totalAmount > 2000 && fraudScore > 0.5) {
      return 'fraud_review';
    }

    // Default: proceed to preparation
    return 'preparing';
  }

  private async resolveFraudReview(): Promise<OrderState> {
    const { fraudScore, customerTier } = this.context;

    // VIP customers get benefit of the doubt
    if (customerTier === 'vip' && fraudScore < 0.85) {
      return 'preparing';
    }

    // Premium customers with moderate risk proceed
    if (customerTier === 'premium' && fraudScore < 0.75) {
      return 'preparing';
    }

    if (fraudScore > 0.9) {
      return 'fraud_rejected';
    }

    // Moderate cases go through manual review
    return 'fraud_review';
  }

  private checkInventory(): OrderState {
    if (!this.context.allItemsInStock) {
      return 'awaiting_stock';
    }

    return 'ready_to_ship';
  }

  private async initiateShipping(): Promise<OrderState> {
    const { shippingRegion, hasHazardousMaterials } = this.context;

    // Restricted regions need export compliance
    if (shippingRegion === 'restricted') {
      if (hasHazardousMaterials) {
        return 'cancelled'; // Can't ship hazardous to restricted regions
      }
    }

    // Hazardous materials need special carrier
    if (hasHazardousMaterials && shippingRegion === 'international') {
      // Requires customs declaration, may delay
    }

    return 'shipped';
  }

  private evaluateReturn(): OrderState {
    const { daysSinceDelivery, returnReason, customerTier, totalAmount } = this.context;

    // Standard 30-day return window
    if (daysSinceDelivery > 30 && customerTier === 'standard') {
      return 'cancelled'; // Return window expired
    }

    // Extended 60-day window for premium/VIP
    if (daysSinceDelivery > 60) {
      return 'cancelled';
    }

    // Defective items always accepted
    if (returnReason === 'defective') {
      return 'return_approved';
    }

    // High-value returns need manager approval
    if (totalAmount > 500 && returnReason === 'changed_mind') {
      if (customerTier === 'vip') {
        return 'return_approved'; // VIP always approved
      }
      return 'return_requested'; // Stay in review
    }

    return 'return_approved';
  }

  requestReturn(reason: string): void {
    if (this.state !== 'delivered') {
      throw new Error(`Cannot request return in state: ${this.state}`);
    }
    this.context.returnReason = reason;
    this.state = 'return_requested';
    this.history.push({
      from: 'delivered',
      to: 'return_requested',
      action: `Return requested: ${reason}`,
    });
  }

  cancel(): void {
    const cancellableStates: OrderState[] = [
      'pending',
      'payment_processing',
      'payment_failed',
      'paid',
      'fraud_review',
      'preparing',
      'awaiting_stock',
    ];

    if (!cancellableStates.includes(this.state)) {
      throw new Error(`Cannot cancel order in state: ${this.state}`);
    }

    const previousState = this.state;
    this.state = 'cancelled';
    this.history.push({
      from: previousState,
      to: 'cancelled',
      action: 'Order cancelled by user',
    });
  }

  getState(): OrderState {
    return this.state;
  }

  getHistory(): StateTransition[] {
    return [...this.history];
  }
}
