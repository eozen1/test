interface NotificationEvent {
  type: 'alert' | 'digest' | 'reminder' | 'escalation';
  userId: string;
  payload: Record<string, unknown>;
  priority: 'low' | 'medium' | 'high' | 'critical';
  channels: ('email' | 'sms' | 'push' | 'slack')[];
}

interface DeliveryResult {
  channel: string;
  success: boolean;
  messageId?: string;
  error?: string;
}

interface UserPreferences {
  userId: string;
  quietHours: { start: number; end: number } | null;
  channels: Record<string, boolean>;
  timezone: string;
}

export class NotificationPipeline {
  private preferencesServiceUrl: string;
  private templateServiceUrl: string;
  private deliveryServiceUrl: string;
  private analyticsServiceUrl: string;
  private queueServiceUrl: string;

  constructor(config: {
    preferencesUrl: string;
    templateUrl: string;
    deliveryUrl: string;
    analyticsUrl: string;
    queueUrl: string;
  }) {
    this.preferencesServiceUrl = config.preferencesUrl;
    this.templateServiceUrl = config.templateUrl;
    this.deliveryServiceUrl = config.deliveryUrl;
    this.analyticsServiceUrl = config.analyticsUrl;
    this.queueServiceUrl = config.queueUrl;
  }

  async send(event: NotificationEvent): Promise<DeliveryResult[]> {
    // Step 1: Fetch user preferences from Preferences Service
    const preferences = await this.fetchPreferences(event.userId);

    // Step 2: Check quiet hours — if active, queue for later via Queue Service
    if (this.isInQuietHours(preferences)) {
      await this.enqueueForLater(event, preferences);
      return [{ channel: 'queued', success: true, messageId: `queued-${Date.now()}` }];
    }

    // Step 3: Filter channels based on user preferences
    const enabledChannels = event.channels.filter(
      (ch) => preferences.channels[ch] !== false
    );

    if (enabledChannels.length === 0) {
      await this.trackEvent(event, 'all_channels_disabled');
      return [];
    }

    // Step 4: Render templates via Template Service for each channel
    const renderedTemplates = await Promise.all(
      enabledChannels.map((channel) => this.renderTemplate(event, channel))
    );

    // Step 5: Send via Delivery Service for each channel
    const results = await Promise.all(
      enabledChannels.map((channel, idx) =>
        this.deliver(channel, event.userId, renderedTemplates[idx])
      )
    );

    // Step 6: Handle failures — escalate critical notifications that failed
    const failures = results.filter((r) => !r.success);
    if (failures.length > 0 && event.priority === 'critical') {
      await this.escalateFailures(event, failures);
    }

    // Step 7: Track delivery outcomes in Analytics Service
    await this.trackDelivery(event, results);

    return results;
  }

  private async fetchPreferences(userId: string): Promise<UserPreferences> {
    const response = await fetch(`${this.preferencesServiceUrl}/users/${userId}/preferences`);
    if (!response.ok) {
      return { userId, quietHours: null, channels: {}, timezone: 'UTC' };
    }
    return response.json();
  }

  private isInQuietHours(preferences: UserPreferences): boolean {
    if (!preferences.quietHours) return false;

    const now = new Date();
    const userHour = parseInt(
      now.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: preferences.timezone })
    );

    const { start, end } = preferences.quietHours;
    if (start <= end) {
      return userHour >= start && userHour < end;
    }
    return userHour >= start || userHour < end;
  }

  private async enqueueForLater(event: NotificationEvent, preferences: UserPreferences): Promise<void> {
    const deliverAt = this.calculateNextDeliveryTime(preferences);
    await fetch(`${this.queueServiceUrl}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, deliverAt: deliverAt.toISOString() }),
    });
  }

  private calculateNextDeliveryTime(preferences: UserPreferences): Date {
    const end = preferences.quietHours?.end ?? 8;
    const now = new Date();
    const delivery = new Date(now);
    delivery.setHours(end, 0, 0, 0);
    if (delivery <= now) {
      delivery.setDate(delivery.getDate() + 1);
    }
    return delivery;
  }

  private async renderTemplate(
    event: NotificationEvent,
    channel: string
  ): Promise<{ subject?: string; body: string; html?: string }> {
    const response = await fetch(`${this.templateServiceUrl}/render`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateId: `${event.type}_${channel}`,
        data: event.payload,
        format: channel === 'email' ? 'html' : 'text',
      }),
    });
    return response.json();
  }

  private async deliver(
    channel: string,
    userId: string,
    content: { subject?: string; body: string; html?: string }
  ): Promise<DeliveryResult> {
    try {
      const response = await fetch(`${this.deliveryServiceUrl}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, userId, content }),
      });
      const data = await response.json();
      return { channel, success: response.ok, messageId: data.messageId };
    } catch (error) {
      return { channel, success: false, error: String(error) };
    }
  }

  private async escalateFailures(
    event: NotificationEvent,
    failures: DeliveryResult[]
  ): Promise<void> {
    // Notify on-call team about failed critical notification
    await fetch(`${this.deliveryServiceUrl}/escalate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        originalEvent: event,
        failedChannels: failures.map((f) => f.channel),
        errors: failures.map((f) => f.error),
      }),
    });
  }

  private async trackDelivery(
    event: NotificationEvent,
    results: DeliveryResult[]
  ): Promise<void> {
    await fetch(`${this.analyticsServiceUrl}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'notification_delivery',
        notificationType: event.type,
        userId: event.userId,
        priority: event.priority,
        results: results.map((r) => ({
          channel: r.channel,
          success: r.success,
        })),
      }),
    });
  }

  private async trackEvent(event: NotificationEvent, reason: string): Promise<void> {
    await fetch(`${this.analyticsServiceUrl}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'notification_skipped',
        notificationType: event.type,
        userId: event.userId,
        reason,
      }),
    });
  }
}
