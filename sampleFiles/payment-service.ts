import { ApiClient } from './api-client';

interface PaymentRequest {
  userId: string;
  orderId: string;
  amount: number;
  currency: string;
  paymentMethod: 'credit_card' | 'bank_transfer' | 'wallet';
}

interface PaymentResponse {
  transactionId: string;
  status: 'pending' | 'completed' | 'failed';
  gatewayRef: string;
}

interface FraudCheckResult {
  riskScore: number;
  approved: boolean;
  flags: string[];
}

export class PaymentService {
  private apiClient: ApiClient;
  private fraudServiceUrl: string;
  private gatewayUrl: string;
  private notificationServiceUrl: string;

  constructor(apiClient: ApiClient, config: { fraudUrl: string; gatewayUrl: string; notifyUrl: string }) {
    this.apiClient = apiClient;
    this.fraudServiceUrl = config.fraudUrl;
    this.gatewayUrl = config.gatewayUrl;
    this.notificationServiceUrl = config.notifyUrl;
  }

  async processPayment(request: PaymentRequest): Promise<PaymentResponse> {
    // Step 1: Validate user with User Service
    const user = await this.apiClient.get(`/users/${request.userId}`);
    if (!user || user.status !== 'active') {
      throw new Error(`User ${request.userId} is not active`);
    }

    // Step 2: Run fraud check via Fraud Detection Service
    const fraudResult = await this.runFraudCheck(request);
    if (!fraudResult.approved) {
      await this.notifyFraudTeam(request, fraudResult);
      throw new Error(`Payment flagged by fraud detection: ${fraudResult.flags.join(', ')}`);
    }

    // Step 3: Reserve inventory via Inventory Service
    const reservation = await this.apiClient.post('/inventory/reserve', {
      orderId: request.orderId,
      userId: request.userId,
    });

    // Step 4: Charge via Payment Gateway
    const gatewayResponse = await this.chargePaymentGateway(request);

    // Step 5: Confirm order with Order Service
    await this.apiClient.post(`/orders/${request.orderId}/confirm`, {
      transactionId: gatewayResponse.transactionId,
      reservationId: reservation.id,
    });

    // Step 6: Send confirmation notification
    await this.sendConfirmation(request.userId, gatewayResponse);

    return gatewayResponse;
  }

  private async runFraudCheck(request: PaymentRequest): Promise<FraudCheckResult> {
    const response = await this.apiClient.post(`${this.fraudServiceUrl}/analyze`, {
      userId: request.userId,
      amount: request.amount,
      currency: request.currency,
      paymentMethod: request.paymentMethod,
      timestamp: new Date().toISOString(),
    });

    return {
      riskScore: response.riskScore,
      approved: response.riskScore < 0.7,
      flags: response.flags || [],
    };
  }

  private async chargePaymentGateway(request: PaymentRequest): Promise<PaymentResponse> {
    const response = await this.apiClient.post(`${this.gatewayUrl}/charges`, {
      amount: request.amount,
      currency: request.currency,
      method: request.paymentMethod,
      metadata: {
        orderId: request.orderId,
        userId: request.userId,
      },
    });

    return {
      transactionId: response.id,
      status: response.status === 'succeeded' ? 'completed' : 'pending',
      gatewayRef: response.reference,
    };
  }

  private async notifyFraudTeam(request: PaymentRequest, result: FraudCheckResult): Promise<void> {
    await this.apiClient.post(`${this.notificationServiceUrl}/alerts`, {
      type: 'fraud_detected',
      severity: result.riskScore > 0.9 ? 'critical' : 'warning',
      payload: {
        userId: request.userId,
        orderId: request.orderId,
        amount: request.amount,
        riskScore: result.riskScore,
        flags: result.flags,
      },
    });
  }

  private async sendConfirmation(userId: string, payment: PaymentResponse): Promise<void> {
    await this.apiClient.post(`${this.notificationServiceUrl}/send`, {
      userId,
      template: 'payment_confirmation',
      data: {
        transactionId: payment.transactionId,
        status: payment.status,
      },
    });
  }
}
