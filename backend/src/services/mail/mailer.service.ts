import nodemailer, { Transporter } from 'nodemailer';
import { config } from '../../config/env.js';

export interface MailerResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

class MailerService {
  private transporter: Transporter | null = null;
  private isConfigured: boolean = false;

  constructor() {
    this.init();
  }

  private init() {
    if (config.smtpHost && config.smtpUser && config.smtpPassword) {
      try {
        this.transporter = nodemailer.createTransport({
          host: config.smtpHost,
          port: config.smtpPort,
          secure: config.smtpPort === 465, // SSL for 465, STARTTLS for 587
          auth: {
            user: config.smtpUser,
            pass: config.smtpPassword,
          },
          connectionTimeout: 10000,
        });
        this.isConfigured = true;
        console.log(`[MailerService] SMTP transport configured for ${config.smtpHost}:${config.smtpPort}`);
      } catch (err: unknown) {
        console.error('[MailerService] Failed to initialize SMTP transporter:', err instanceof Error ? err.message : String(err));
        this.transporter = null;
        this.isConfigured = false;
      }
    } else {
      console.warn('[MailerService] Missing SMTP credentials. Email sending disabled.');
    }
  }

  /**
   * Tests SMTP authentication and connectivity without sending any emails.
   */
  public async verifyConnection(): Promise<{ success: boolean; host?: string; port?: number; error?: string }> {
    if (!this.transporter || !this.isConfigured) {
      return { success: false, error: 'SMTP credentials not configured on the server.' };
    }

    try {
      await this.transporter.verify();
      return {
        success: true,
        host: config.smtpHost,
        port: config.smtpPort,
      };
    } catch (err: unknown) {
      return {
        success: false,
        host: config.smtpHost,
        port: config.smtpPort,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Dispatches an account email verification message with a secure confirmation link.
   */
  public async sendVerificationEmail(to: string, verificationUrl: string, username?: string): Promise<MailerResult> {
    if (!this.transporter || !this.isConfigured) {
      return { success: false, error: 'SMTP mailer is not configured on the server.' };
    }

    const fromAddress = config.smtpFrom || `7Anime Security <${config.smtpUser}>`;
    const logoUrl = config.publicLogoUrl || '/logo.png';
    const userLabel = username || to.split('@')[0];

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Verify your 7Anime Account</title>
</head>
<body style="margin: 0; padding: 0; background-color: #07090e; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e2e8f0;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #07090e; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; background-color: #0d121f; border: 1px solid #1e293b; border-radius: 16px; padding: 36px 28px;">
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <img src="${logoUrl}" alt="7Anime" width="140" style="display: block; border: 0;" />
            </td>
          </tr>
          <tr>
            <td align="center">
              <h1 style="margin: 0 0 12px 0; font-size: 22px; font-weight: 700; color: #ffffff;">Confirm Your Email Address</h1>
              <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #94a3b8;">
                Hello <strong>${userLabel}</strong>, welcome to 7Anime! Please confirm your email address to activate your account and start building your watchlist.
              </p>
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
                <tr>
                  <td align="center" style="border-radius: 8px; background: #0284c7;">
                    <a href="${verificationUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none;">
                      Verify Email Address
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin: 16px 0 0 0; font-size: 12px; color: #64748b;">
                If you did not create a 7Anime account, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    try {
      const info = await this.transporter.sendMail({
        from: fromAddress,
        to,
        subject: 'Verify your 7Anime Account',
        html: htmlContent,
      });

      console.log(`[MailerService] Verification email sent to ${to}. MessageId: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (err: unknown) {
      console.error(`[MailerService] Failed to send verification email to ${to}:`, err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Dispatches a password reset email with an OTP or secure reset link.
   */
  public async sendPasswordResetEmail(to: string, resetCodeOrUrl: string, username?: string): Promise<MailerResult> {
    if (!this.transporter || !this.isConfigured) {
      return { success: false, error: 'SMTP mailer is not configured on the server.' };
    }

    const fromAddress = config.smtpFrom || `7Anime Security <${config.smtpUser}>`;
    const logoUrl = config.publicLogoUrl || '/logo.png';
    const isUrl = resetCodeOrUrl.startsWith('http://') || resetCodeOrUrl.startsWith('https://');

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Reset Your 7Anime Password</title>
</head>
<body style="margin: 0; padding: 0; background-color: #07090e; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e2e8f0;">
  <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #07090e; padding: 40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; background-color: #0d121f; border: 1px solid #1e293b; border-radius: 16px; padding: 36px 28px;">
          <tr>
            <td align="center" style="padding-bottom: 24px;">
              <img src="${logoUrl}" alt="7Anime" width="140" style="display: block; border: 0;" />
            </td>
          </tr>
          <tr>
            <td align="center">
              <h1 style="margin: 0 0 12px 0; font-size: 22px; font-weight: 700; color: #ffffff;">Reset Your Password</h1>
              <p style="margin: 0 0 24px 0; font-size: 14px; line-height: 1.6; color: #94a3b8;">
                We received a request to reset the password for your 7Anime account. Use the verification ${isUrl ? 'link' : 'code'} below:
              </p>
              ${isUrl ? `
                <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
                  <tr>
                    <td align="center" style="border-radius: 8px; background: #0284c7;">
                      <a href="${resetCodeOrUrl}" target="_blank" style="display: inline-block; padding: 14px 32px; font-size: 14px; font-weight: 600; color: #ffffff; text-decoration: none;">
                        Reset Password
                      </a>
                    </td>
                  </tr>
                </table>
              ` : `
                <div style="background-color: #090d16; border: 1px solid #0284c7; border-radius: 12px; padding: 18px 24px; margin: 20px 0; display: inline-block;">
                  <span style="font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #38bdf8; font-family: monospace;">
                    ${resetCodeOrUrl}
                  </span>
                </div>
              `}
              <p style="margin: 16px 0 0 0; font-size: 12px; color: #64748b;">
                This code expires in 15 minutes. If you did not request a password reset, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    try {
      const info = await this.transporter.sendMail({
        from: fromAddress,
        to,
        subject: 'Reset Your 7Anime Password',
        html: htmlContent,
      });

      console.log(`[MailerService] Password reset email sent to ${to}. MessageId: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (err: unknown) {
      console.error(`[MailerService] Failed to send password reset email to ${to}:`, err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

export const mailerService = new MailerService();
