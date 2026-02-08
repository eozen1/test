/**
 * Push Notification Client - wrapper around push notification service
 */

interface PushMessage {
  deviceToken: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}

export class PushClient {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.PUSH_API_KEY || '';
    this.baseUrl = 'https://api.pushservice.com/v1';
  }

  async send(message: PushMessage): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/notifications`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          token: message.deviceToken,
          notification: {
            title: message.title,
            body: message.body,
          },
          data: message.data,
        }),
      });

      return response.ok;
    } catch (error) {
      console.error('Failed to send push notification:', error);
      return false;
    }
  }
}
