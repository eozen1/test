/**
 * Email Client - wrapper around email provider API
 */

interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  cc?: string[];
}

export class EmailClient {
  private apiKey: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.EMAIL_API_KEY || '';
    this.baseUrl = 'https://api.emailprovider.com/v1';
  }

  async send(message: EmailMessage): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      return response.ok;
    } catch (error) {
      console.error('Failed to send email:', error);
      return false;
    }
  }
}
