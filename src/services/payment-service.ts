import { PaymentGateway } from '../gateways/stripe';
import { OrderRepository } from '../repositories/order';
import { NotificationService } from './notification-service';
import { Logger } from '../utils/logger';

export class PaymentService {
  constructor(
    private gateway: PaymentGateway,
    private orderRepo: OrderRepository,
    private notifier: NotificationService,
    private logger: Logger
  ) {}

  async processPayment(orderId: string, paymentDetails: PaymentDetails): Promise<PaymentResult> {
    this.logger.info('Starting payment processing', { orderId });
    
    const order = await this.orderRepo.findById(orderId);
    if (!order) {
      throw new OrderNotFoundError(orderId);
    }

    if (order.status !== 'pending') {
      throw new InvalidOrderStateError(order.status);
    }

    const gatewayResponse = await this.gateway.charge({
      amount: order.total,
      currency: order.currency,
      source: paymentDetails.token,
      metadata: { orderId }
    });

    if (gatewayResponse.success) {
      await this.orderRepo.updateStatus(orderId, 'paid');
      await this.notifier.sendPaymentConfirmation(order.customerId, orderId);
      this.logger.info('Payment successful', { orderId, transactionId: gatewayResponse.transactionId });
    } else {
      await this.orderRepo.updateStatus(orderId, 'payment_failed');
      await this.notifier.sendPaymentFailure(order.customerId, orderId, gatewayResponse.error);
      this.logger.warn('Payment failed', { orderId, error: gatewayResponse.error });
    }

    return {
      success: gatewayResponse.success,
      transactionId: gatewayResponse.transactionId,
      error: gatewayResponse.error
    };
  }
}

interface PaymentDetails {
  token: string;
  saveCard?: boolean;
}

interface PaymentResult {
  success: boolean;
  transactionId?: string;
  error?: string;
}

class OrderNotFoundError extends Error {
  constructor(orderId: string) {
    super(`Order not found: ${orderId}`);
  }
}

class InvalidOrderStateError extends Error {
  constructor(state: string) {
    super(`Invalid order state for payment: ${state}`);
  }
}
