import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

export class EmailService {
  private ses: SESClient;
  constructor(region: string, private fromEmail: string) {
    this.ses = new SESClient({ region });
  }

  async sendInvite(to: string, inviteUrl: string) {
    const subject = "You’ve been invited";
    const bodyText = `You’ve been invited. Use this link to set your password (valid for 48 hours, one-time use):\n\n${inviteUrl}\n`;

    await this.ses.send(new SendEmailCommand({
      Source: this.fromEmail,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject },
        Body: { Text: { Data: bodyText } }
      }
    }));
  }
}
