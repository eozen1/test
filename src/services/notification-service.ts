/**
 * Notification Service - handles sending notifications to users
 */

import { UserService } from './user-service';
import { EmailClient } from '../clients/email-client';
import { PushClient } from '../clients/push-client';

interface NotificationPayload {
  userId: string;
  title: string;
  message: string;
  type: 'email' | 'push' | 'both';
}

export class NotificationService {
  private userService: UserService;
  private emailClient: EmailClient;
  private pushClient: PushClient;

  constructor() {
    this.userService = new UserService();
    this.emailClient = new EmailClient();
    this.pushClient = new PushClient();
  }

  /**
   * Send a notification to a user
   * Flow: NotificationService -> UserService -> EmailClient/PushClient
   */
  async sendNotification(payload: NotificationPayload): Promise<boolean> {
    // 1. Fetch user preferences from UserService
    const user = await this.userService.getUser(payload.userId);
    if (!user) {
      throw new Error(`User ${payload.userId} not found`);
    }

    // 2. Check user notification preferences
    const preferences = await this.userService.getNotificationPreferences(payload.userId);

    // 3. Send via appropriate channels
    const results: boolean[] = [];

    if (payload.type === 'email' || payload.type === 'both') {
      if (preferences.emailEnabled) {
        const emailResult = await this.emailClient.send({
          to: user.email,
          subject: payload.title,
          body: payload.message,
        });
        results.push(emailResult);
      }
    }

    if (payload.type === 'push' || payload.type === 'both') {
      if (preferences.pushEnabled && user.deviceToken) {
        const pushResult = await this.pushClient.send({
          deviceToken: user.deviceToken,
          title: payload.title,
          body: payload.message,
        });
        results.push(pushResult);
      }
    }

    // 4. Log notification event
    await this.logNotificationEvent(payload.userId, payload.type, results);

    return results.every(r => r === true);
  }

  private async logNotificationEvent(
    userId: string,
    type: string,
    results: boolean[]
  ): Promise<void> {
    console.log(`Notification sent to ${userId} via ${type}: ${results}`);
  }
}
