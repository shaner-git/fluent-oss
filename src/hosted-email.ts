export interface HostedEmailBinding {
  send(message: HostedEmailMessage): Promise<HostedEmailSendResult>;
}

export interface HostedEmailMessage {
  to: string | string[];
  from: string | { email: string; name: string };
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string | { email: string; name: string };
  headers?: Record<string, string>;
}

export interface HostedEmailSendResult {
  messageId: string;
}

export interface HostedEmailRuntimeEnv {
  EMAIL?: HostedEmailBinding;
  HOSTED_EMAIL_FROM_ADDRESS?: string;
  HOSTED_EMAIL_FROM_NAME?: string;
}

type HostedMagicLinkInput = {
  email: string;
  url: string;
};

type CloudflareEmailError = Error & {
  code?: string;
};

const DEFAULT_FROM_ADDRESS = 'signin@meetfluent.app';
const DEFAULT_FROM_NAME = 'Fluent';

export function hasHostedEmailDelivery(env: HostedEmailRuntimeEnv): boolean {
  return typeof env.EMAIL?.send === 'function';
}

export function resolveHostedEmailFromAddress(env: HostedEmailRuntimeEnv): string {
  return env.HOSTED_EMAIL_FROM_ADDRESS?.trim() || DEFAULT_FROM_ADDRESS;
}

export function resolveHostedEmailFromName(env: HostedEmailRuntimeEnv): string {
  return env.HOSTED_EMAIL_FROM_NAME?.trim() || DEFAULT_FROM_NAME;
}

export function buildHostedMagicLinkEmailMessage(
  env: HostedEmailRuntimeEnv,
  input: HostedMagicLinkInput,
): HostedEmailMessage {
  const from = {
    email: resolveHostedEmailFromAddress(env),
    name: resolveHostedEmailFromName(env),
  };
  const subject = 'Your Fluent sign-in link';
  const safeEmail = escapeHtml(input.email);
  const safeUrl = escapeHtml(input.url);

  // Design notes:
  // - Email clients are hostile to dark mode + web fonts. We use a warm bone background
  //   (#F5F1E8) with deep ink text (#181613) and terracotta accent (#D97757) — matches
  //   Fluent's palette while staying legible across Gmail / Apple Mail / Outlook.
  // - Typography: Georgia/Palatino serif for display (mirrors Fraunces tone), system
  //   sans for body. No web fonts — emails shouldn't depend on network font loads.
  // - Structure: tight 560px card, mono uppercase eyebrow, large serif headline,
  //   terracotta button, fallback plain-text link, muted disclaimer footer.

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light only" />
    <meta name="supported-color-schemes" content="light" />
    <title>Your Fluent sign-in link</title>
  </head>
  <body style="margin:0;padding:0;background:#F5F1E8;color:#181613;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Sign in to Fluent — link expires in 15 minutes.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F5F1E8;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;">
            <tr>
              <td style="padding:0 4px 24px;">
                <table role="presentation" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="vertical-align:middle;padding-right:10px;">
                      <svg width="26" height="26" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                        <path d="M8 22 C 8 14, 14 10, 22 10 L 24 10 L 24 14 C 24 20, 19 24, 13 24 C 10.2 24, 8 22.5, 8 20.5 Z" stroke="#D97757" stroke-width="1.6" fill="rgba(217,119,87,0.1)"/>
                        <line x1="13" y1="6" x2="13" y2="10" stroke="#D97757" stroke-width="1.6" stroke-linecap="round"/>
                        <line x1="17" y1="6" x2="17" y2="10" stroke="#D97757" stroke-width="1.6" stroke-linecap="round"/>
                        <line x1="21" y1="6" x2="21" y2="10" stroke="#D97757" stroke-width="1.6" stroke-linecap="round"/>
                      </svg>
                    </td>
                    <td style="vertical-align:middle;font-family:Georgia,'Palatino Linotype','Book Antiqua',serif;font-size:20px;letter-spacing:-0.01em;color:#181613;">
                      Fluent
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="background:#FFFDF8;border:1px solid #E1D8C6;border-radius:14px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="padding:36px 36px 28px;">
                      <p style="margin:0 0 14px;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:10.5px;letter-spacing:0.22em;text-transform:uppercase;color:#7A7164;">
                        ⟩ Fluent sign-in
                      </p>
                      <h1 style="margin:0 0 18px;font-family:Georgia,'Palatino Linotype','Book Antiqua',serif;font-weight:400;font-size:30px;line-height:1.12;letter-spacing:-0.02em;color:#181613;">
                        Your sign-in link <em style="color:#D97757;font-style:italic;">is ready</em>.
                      </h1>
                      <p style="margin:0 0 16px;font-size:15.5px;line-height:1.6;color:#4A443D;">
                        We received a request to sign in to Fluent as <strong style="color:#181613;">${safeEmail}</strong>.
                      </p>
                      <p style="margin:0 0 28px;font-size:15.5px;line-height:1.6;color:#4A443D;">
                        This link works in the same browser for the next 15 minutes.
                      </p>
                      <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 24px;">
                        <tr>
                          <td style="border-radius:10px;background:#D97757;">
                            <a href="${safeUrl}" style="display:inline-block;padding:14px 22px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:#181613;text-decoration:none;border-radius:10px;">
                              Sign in to Fluent &nbsp;&rarr;
                            </a>
                          </td>
                        </tr>
                      </table>
                      <p style="margin:0 0 6px;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#7A7164;">
                        If the button doesn't open
                      </p>
                      <p style="margin:0 0 4px;font-size:13px;line-height:1.55;color:#6B655C;">
                        Copy and paste this link into your browser:
                      </p>
                      <p style="margin:0;font-size:13px;line-height:1.55;word-break:break-all;">
                        <a href="${safeUrl}" style="color:#D97757;text-decoration:underline;">${safeUrl}</a>
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:18px 36px 28px;border-top:1px solid #ECE3D1;">
                      <p style="margin:0;font-size:12.5px;line-height:1.6;color:#7A7164;">
                        If you didn't request this email, you can safely ignore it — no account action will be taken without the link above.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 8px 0;text-align:center;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:10.5px;letter-spacing:0.22em;text-transform:uppercase;color:#9A9185;">
                Fluent · <a href="https://meetfluent.app" style="color:#9A9185;text-decoration:none;">meetfluent.app</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return {
    from,
    html,
    subject,
    text: [
      `Sign in to Fluent as ${input.email}.`,
      '',
      'Use this link in the same browser within 15 minutes:',
      input.url,
      '',
      "If you didn't request this email, you can ignore it.",
      '',
      '— Fluent · meetfluent.app',
    ].join('\n'),
    to: input.email,
  };
}

export async function sendHostedMagicLinkEmail(
  env: HostedEmailRuntimeEnv,
  input: HostedMagicLinkInput,
): Promise<HostedEmailSendResult> {
  if (!hasHostedEmailDelivery(env)) {
    throw new Error('Cloudflare Email Service is not configured for hosted sign-in links yet.');
  }

  try {
    return await env.EMAIL!.send(buildHostedMagicLinkEmailMessage(env, input));
  } catch (error) {
    const failureMessage = formatHostedEmailFailure(error, resolveHostedEmailFromAddress(env));
    console.error('Magic link delivery failed', {
      code: getHostedEmailErrorCode(error),
      email: input.email,
      failureMessage,
    });
    throw new Error(failureMessage);
  }
}

function formatHostedEmailFailure(error: unknown, fromAddress: string): string {
  const code = getHostedEmailErrorCode(error);
  switch (code) {
    case 'E_SENDER_DOMAIN_NOT_AVAILABLE':
      return `Hosted sign-in email is not ready yet. Cloudflare Email Service still needs to be onboarded for ${fromAddress}.`;
    case 'E_SENDER_NOT_VERIFIED':
      return `Hosted sign-in email is not ready yet. ${fromAddress} has not been verified for Cloudflare Email Service.`;
    case 'E_RATE_LIMIT_EXCEEDED':
    case 'E_DAILY_LIMIT_EXCEEDED':
      return 'Hosted sign-in email is temporarily rate-limited. Please wait a minute and try again.';
    case 'E_RECIPIENT_SUPPRESSED':
      return 'This email address is currently suppressed by the delivery provider. Use another address or clear the suppression first.';
    case 'E_DELIVERY_FAILED':
      return 'Fluent could not deliver the sign-in email to that inbox. Please double-check the address and try again.';
    default: {
      const fallback = getHostedEmailErrorMessage(error);
      return fallback || 'Fluent could not send the sign-in email right now.';
    }
  }
}

function getHostedEmailErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') {
    return null;
  }

  const code = (error as CloudflareEmailError).code;
  return typeof code === 'string' && code.trim().length > 0 ? code.trim() : null;
}

function getHostedEmailErrorMessage(error: unknown): string | null {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.trim();
  }

  return null;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
