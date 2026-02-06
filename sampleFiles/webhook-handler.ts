import { ApiClient } from './api-client';

type WebhookEvent =
  | { type: 'payment.succeeded'; data: { chargeId: string; amount: number; orderId: string } }
  | { type: 'payment.failed'; data: { chargeId: string; reason: string; orderId: string } }
  | { type: 'refund.created'; data: { refundId: string; chargeId: string; amount: number } }
  | { type: 'dispute.opened'; data: { disputeId: string; chargeId: string; reason: string } };

interface WebhookHandlerConfig {
  orderServiceUrl: string;
  inventoryServiceUrl: string;
  notificationServiceUrl: string;
  analyticsServiceUrl: string;
}

export class WebhookHandler {
  private apiClient: ApiClient;
  private config: WebhookHandlerConfig;

  constructor(apiClient: ApiClient, config: WebhookHandlerConfig) {
    this.apiClient = apiClient;
    this.config = config;
  }

  async handleEvent(event: WebhookEvent): Promise<void> {
    switch (event.type) {
      case 'payment.succeeded':
        await this.handlePaymentSuccess(event.data);
        break;
      case 'payment.failed':
        await this.handlePaymentFailure(event.data);
        break;
      case 'refund.created':
        await this.handleRefund(event.data);
        break;
      case 'dispute.opened':
        await this.handleDispute(event.data);
        break;
    }
  }

  private async handlePaymentSuccess(data: { chargeId: string; amount: number; orderId: string }): Promise<void> {
    // Update order status in Order Service
    await this.apiClient.put(`${this.config.orderServiceUrl}/orders/${data.orderId}`, {
      status: 'paid',
      chargeId: data.chargeId,
      paidAt: new Date().toISOString(),
    });

    // Trigger fulfillment in Inventory Service
    await this.apiClient.post(`${this.config.inventoryServiceUrl}/fulfillment`, {
      orderId: data.orderId,
      action: 'begin_shipping',
    });

    // Send receipt via Notification Service
    const order = await this.apiClient.get(`${this.config.orderServiceUrl}/orders/${data.orderId}`);
    await this.apiClient.post(`${this.config.notificationServiceUrl}/send`, {
      userId: order.userId,
      template: 'receipt',
      data: { orderId: data.orderId, amount: data.amount },
    });

    // Track in Analytics Service
    await this.apiClient.post(`${this.config.analyticsServiceUrl}/events`, {
      event: 'payment_completed',
      properties: { orderId: data.orderId, amount: data.amount },
    });
  }

  private async handlePaymentFailure(data: { chargeId: string; reason: string; orderId: string }): Promise<void> {
    // Update order status
    await this.apiClient.put(`${this.config.orderServiceUrl}/orders/${data.orderId}`, {
      status: 'payment_failed',
      failureReason: data.reason,
    });

    // Release reserved inventory
    await this.apiClient.post(`${this.config.inventoryServiceUrl}/release`, {
      orderId: data.orderId,
    });

    // Notify user of failure
    const order = await this.apiClient.get(`${this.config.orderServiceUrl}/orders/${data.orderId}`);
    await this.apiClient.post(`${this.config.notificationServiceUrl}/send`, {
      userId: order.userId,
      template: 'payment_failed',
      data: { orderId: data.orderId, reason: data.reason },
    });
  }

  private async handleRefund(data: { refundId: string; chargeId: string; amount: number }): Promise<void> {
    // Find the order associated with this charge
    const charge = await this.apiClient.get(`${this.config.orderServiceUrl}/charges/${data.chargeId}`);

    // Update order with refund info
    await this.apiClient.put(`${this.config.orderServiceUrl}/orders/${charge.orderId}`, {
      status: 'refunded',
      refundId: data.refundId,
      refundAmount: data.amount,
    });

    // Restore inventory
    await this.apiClient.post(`${this.config.inventoryServiceUrl}/restore`, {
      orderId: charge.orderId,
    });

    // Notify customer
    await this.apiClient.post(`${this.config.notificationServiceUrl}/send`, {
      userId: charge.userId,
      template: 'refund_processed',
      data: { refundId: data.refundId, amount: data.amount },
    });
  }

  private async handleDispute(data: { disputeId: string; chargeId: string; reason: string }): Promise<void> {
    // Flag the order
    const charge = await this.apiClient.get(`${this.config.orderServiceUrl}/charges/${data.chargeId}`);
    await this.apiClient.put(`${this.config.orderServiceUrl}/orders/${charge.orderId}`, {
      status: 'disputed',
      disputeId: data.disputeId,
    });

    // Alert fraud team
    await this.apiClient.post(`${this.config.notificationServiceUrl}/alerts`, {
      type: 'dispute_opened',
      severity: 'high',
      payload: {
        disputeId: data.disputeId,
        chargeId: data.chargeId,
        orderId: charge.orderId,
        reason: data.reason,
      },
    });

    // Track in analytics
    await this.apiClient.post(`${this.config.analyticsServiceUrl}/events`, {
      event: 'dispute_opened',
      properties: { disputeId: data.disputeId, reason: data.reason },
    });
  }
}
