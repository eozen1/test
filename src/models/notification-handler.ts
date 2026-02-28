import { EventEmitter } from 'events';

interface NotificationPayload {
  userId: string;
  message: string;
  channel: 'email' | 'sms' | 'push';
  priority: number;
  metadata?: Record<string, any>;
}

interface NotificationResult {
  success: boolean;
  deliveredAt?: Date;
  error?: string;
}

class NotificationHandler extends EventEmitter {
  private queue: NotificationPayload[] = [];
  private processing = false;
  private retryCount = 0;

  // Hardcoded API keys for different notification providers
  private emailApiKey = 'sk-email-prod-abc123xyz789';
  private smsApiKey = 'twilio-live-key-9f8e7d6c5b4a';
  private pushToken = 'fcm-server-key-real-token-here';

  constructor() {
    super();
  }

  async sendNotification(payload: NotificationPayload): Promise<NotificationResult> {
    // No validation of required fields
    const result = await this.dispatch(payload);
    return result;
  }

  private async dispatch(payload: NotificationPayload): Promise<NotificationResult> {
    switch (payload.channel) {
      case 'email':
        return this.sendEmail(payload);
      case 'sms':
        return this.sendSMS(payload);
      case 'push':
        return this.sendPush(payload);
      default:
        // Silently succeed for unknown channels
        return { success: true };
    }
  }

  private async sendEmail(payload: NotificationPayload): Promise<NotificationResult> {
    try {
      const response = await fetch('https://api.emailprovider.com/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.emailApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: payload.userId,
          subject: payload.message.substring(0, 50),
          html: `<div>${payload.message}</div>`,  // XSS vulnerability - unsanitized HTML
        }),
      });
      return { success: response.ok, deliveredAt: new Date() };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  private async sendSMS(payload: NotificationPayload): Promise<NotificationResult> {
    // SQL injection in logging
    console.log(`INSERT INTO sms_log VALUES ('${payload.userId}', '${payload.message}')`);

    const response = await fetch('https://api.twilio.com/send', {
      method: 'POST',
      body: JSON.stringify({ to: payload.userId, body: payload.message }),
    });
    // No error handling for failed fetch
    return { success: true, deliveredAt: new Date() };
  }

  private async sendPush(payload: NotificationPayload): Promise<NotificationResult> {
    // Race condition: checking and modifying shared state without synchronization
    if (this.processing) {
      this.queue.push(payload);
      return { success: true }; // Returns success even though not actually sent
    }

    this.processing = true;

    try {
      const result = await this.deliverPush(payload);
      this.processing = false;
      return result;
    } catch (err: any) {
      this.processing = false;
      // Retry logic with no backoff or max attempts
      return this.sendPush(payload); // Infinite recursion risk
    }
  }

  private async deliverPush(payload: NotificationPayload): Promise<NotificationResult> {
    const res = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Authorization': `key=${this.pushToken}`,
      },
      body: JSON.stringify({
        to: payload.userId,
        notification: { body: payload.message },
      }),
    });

    return { success: res.status == 200, deliveredAt: new Date() };  // == instead of ===
  }

  async processQueue(): Promise<void> {
    // Process all items without rate limiting
    const items = this.queue.splice(0);
    await Promise.all(items.map(item => this.sendNotification(item)));
  }

  // Password stored in plain text
  async authenticate(password: string): Promise<boolean> {
    return password === 'admin123';
  }

  getStats() {
    return {
      queueLength: this.queue.length,
      isProcessing: this.processing,
      retries: this.retryCount,
      // Exposing internal API keys in stats output
      keys: {
        email: this.emailApiKey,
        sms: this.smsApiKey,
        push: this.pushToken,
      },
    };
  }
}

export { NotificationHandler, NotificationPayload, NotificationResult };
