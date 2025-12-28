import { FastifyReply, FastifyRequest } from "fastify";
import { Env } from "../config/env";
import { CognitoIdp } from "../services/cognitoIdp";
import { ProfileStore } from "../services/profileStore";
import { InviteStore } from "../services/inviteStore";
import { verifyInviteToken } from "../services/inviteToken";
import {
  RegisterSchema,
  ConfirmSchema,
  EmailOnlySchema,
  ConfirmForgotSchema,
  LoginSchema,
  RefreshSchema,
  AcceptInviteSchema
} from "../models/schemas";

function htmlEscape(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function authHandlers(env: Env) {
  const idp = new CognitoIdp(env.AWS_REGION);

  return {
    /**
     * Invite-only SaaS should not expose public registration.
     * Keep these handlers only if you need them for internal testing.
     */
    async register(req: FastifyRequest, reply: FastifyReply) {
      return reply.code(404).send({ message: "Self-registration is disabled. Ask an admin for an invite." });
    },

    async confirm(req: FastifyRequest, reply: FastifyReply) {
      return reply.code(404).send({ message: "Self-registration is disabled. Ask an admin for an invite." });
    },

    async login(req: FastifyRequest, reply: FastifyReply) {
      const body = LoginSchema.parse(req.body);
      const tenant = (req as any).tenant;

      const email = body.email.toLowerCase();
      const out = await idp.loginUserPassword(tenant.cognitoAppClientId, email, body.password);

      return reply.send({
        accessToken: out.AuthenticationResult?.AccessToken,
        idToken: out.AuthenticationResult?.IdToken,
        refreshToken: out.AuthenticationResult?.RefreshToken,
        expiresIn: out.AuthenticationResult?.ExpiresIn,
        tokenType: out.AuthenticationResult?.TokenType
      });
    },

    async refresh(req: FastifyRequest, reply: FastifyReply) {
      const body = RefreshSchema.parse(req.body);
      const tenant = (req as any).tenant;

      const out = await idp.refreshSession(tenant.cognitoAppClientId, body.refreshToken);

      return reply.send({
        accessToken: out.AuthenticationResult?.AccessToken,
        idToken: out.AuthenticationResult?.IdToken,
        expiresIn: out.AuthenticationResult?.ExpiresIn,
        tokenType: out.AuthenticationResult?.TokenType
      });
    },

    /**
     * B-flow: Invite link lands on API.
     * - GET  /v1/auth/invite/accept?token=...   => render minimal password set page
     * - POST /v1/auth/invite/accept            => set password + mark invite used + redirect to UI
     */
    async acceptInvite(req: FastifyRequest, reply: FastifyReply) {
      const tenant = (req as any).tenant;

      const inviteTable = (env as any).INVITE_TABLE_NAME || process.env.INVITE_TABLE_NAME;
      const inviteSecret = (env as any).INVITE_JWT_SECRET || process.env.INVITE_JWT_SECRET;

      if (!inviteTable) return reply.code(500).send({ message: "INVITE_TABLE_NAME not configured" });
      if (!inviteSecret) return reply.code(500).send({ message: "INVITE_JWT_SECRET not configured" });

      // Needed to know where to redirect after success
      const uiBaseUrl = tenant.uiBaseUrl;
      if (!uiBaseUrl) {
        return reply.code(500).send({ message: "tenant.uiBaseUrl is missing. Add uiBaseUrl to the tenant registry item." });
      }

      // GET: render form (JS posts JSON so you don't need @fastify/formbody)
      if (req.method === "GET") {
        const token = String((req.query as any)?.token || "");
        if (!token) return reply.code(400).send({ message: "Missing token" });

        const safeToken = htmlEscape(token);

        const html = `<!doctype html>
          <html lang="en">
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width,initial-scale=1" />
            <title>Set your password</title>
            <style>
              body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; margin: 0; padding: 32px; background: #0b1220; color: #e7e9ee; }
              .card { max-width: 520px; margin: 0 auto; background: #121a2b; padding: 24px; border-radius: 14px; box-shadow: 0 10px 30px rgba(0,0,0,.35); }
              h1 { margin: 0 0 8px; font-size: 20px; }
              p { margin: 0 0 18px; color: #b7bed0; font-size: 14px; }
              label { display:block; margin: 14px 0 6px; font-size: 13px; color: #cfd6e6; }
              input { width: 100%; padding: 12px; border-radius: 10px; border: 1px solid #2a3551; background: #0b1220; color: #e7e9ee; }
              button { margin-top: 18px; width: 100%; padding: 12px; border-radius: 10px; border: 0; background: #4f7cff; color: white; font-weight: 600; cursor: pointer; }
              .small { font-size: 12px; margin-top: 12px; color: #9aa4bd; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>Set your password</h1>
              <p>Your invite link expires in 48 hours and can be used only once.</p>

              <form>
                <input type="hidden" name="token" value="${safeToken}" />
                <label>New password</label>
                <input type="password" name="newPassword" minlength="8" required />
                <label>Confirm password</label>
                <input type="password" name="confirmPassword" minlength="8" required />
                <button type="submit">Set password</button>
              </form>

              <div class="small">If this link has expired, ask your admin to send a new invite.</div>
            </div>

            <script>
              const form = document.querySelector("form");
              form.addEventListener("submit", async (e) => {
                e.preventDefault();

                const token = form.querySelector('input[name="token"]').value;
                const p1 = form.querySelector('input[name="newPassword"]').value;
                const p2 = form.querySelector('input[name="confirmPassword"]').value;

                if (p1 !== p2) {
                  alert("Passwords do not match.");
                  return;
                }

                try {
                  const res = await fetch("", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ token, newPassword: p1 })
                  });

                  if (res.redirected) {
                    window.location.href = res.url;
                    return;
                  }

                  if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    alert(data.message || "Failed to set password.");
                    return;
                  }

                  window.location.href = window.location.origin;
                } catch (err) {
                  alert("Network error. Please try again.");
                }
              });
            </script>
          </body>
          </html>`;

        reply.header("content-type", "text/html; charset=utf-8");
        return reply.send(html);
      }

      // POST: accept invite + set password
      const rawToken = (req.body as any)?.token;
      const rawPassword = (req.body as any)?.newPassword;

      const body = AcceptInviteSchema.parse({ token: rawToken, newPassword: rawPassword });
      const token = body.token;
      const newPassword = body.newPassword;

      // 1) Verify JWT (signature + exp)
      const payload = verifyInviteToken(inviteSecret, token) as {
        tenantId: string;
        inviteId: string;
        userId: string;
        email: string;
        expiresAt: number;
      };

      if (!payload?.tenantId || !payload?.inviteId || !payload?.email) {
        return reply.code(400).send({ message: "Invalid invite token" });
      }

      if (payload.tenantId !== tenant.tenantId) {
        return reply.code(403).send({ message: "Invite token does not match tenant" });
      }

      // 2) One-time use + not expired (atomic)
      const inviteStore = new InviteStore(env.AWS_REGION, inviteTable);
      const nowEpoch = Math.floor(Date.now() / 1000);

      try {
        await inviteStore.useInviteOnce({ tenantId: tenant.tenantId, inviteId: payload.inviteId, nowEpoch });
      } catch (e: any) {
        return reply.code(400).send({ message: "Invite link is invalid, expired, or already used." });
      }

      // 3) Set Cognito password permanently (no temp password needed)
      await idp.adminSetUserPasswordPermanent(
        tenant.cognitoUserPoolId,
        payload.email.toLowerCase(),
        newPassword
      );

      // 4) Immediately log the user in (USER_PASSWORD_AUTH)
      const loginOut = await idp.loginUserPassword(
        tenant.cognitoAppClientId,
        payload.email.toLowerCase(),
        newPassword
      );

      const accessToken = loginOut.AuthenticationResult?.AccessToken;
      const idToken = loginOut.AuthenticationResult?.IdToken;
      const refreshToken = loginOut.AuthenticationResult?.RefreshToken;
      const expiresIn = loginOut.AuthenticationResult?.ExpiresIn;
      const tokenType = loginOut.AuthenticationResult?.TokenType || "Bearer";

      if (!accessToken || !idToken) {
        // If this happens, the user can still log in normally from UI
        return reply.redirect(302, `${uiBaseUrl.replace(/\/$/, "")}/login?invite=accepted`);
      }

      // 5) Redirect to UI with tokens in URL fragment (safer than query params)
      const callbackUrl = `${uiBaseUrl.replace(/\/$/, "")}/auth/callback`;

      const fragment =
        `access_token=${encodeURIComponent(accessToken)}` +
        `&id_token=${encodeURIComponent(idToken)}` +
        (refreshToken ? `&refresh_token=${encodeURIComponent(refreshToken)}` : "") +
        (expiresIn ? `&expires_in=${encodeURIComponent(String(expiresIn))}` : "") +
        `&token_type=${encodeURIComponent(tokenType)}`;

      return reply.redirect(302, `${callbackUrl}#${fragment}`);

    },

    async forgot(req: FastifyRequest, reply: FastifyReply) {
      const body = EmailOnlySchema.parse(req.body);
      const tenant = (req as any).tenant;
      const out = await idp.forgotPassword(tenant.cognitoAppClientId, body.email.toLowerCase());
      return reply.send({ ok: true, out });
    },

    async confirmForgot(req: FastifyRequest, reply: FastifyReply) {
      const body = ConfirmForgotSchema.parse(req.body);
      const tenant = (req as any).tenant;
      const out = await idp.confirmForgotPassword(
        tenant.cognitoAppClientId,
        body.email.toLowerCase(),
        body.code,
        body.newPassword
      );
      return reply.send({ ok: true, out });
    }
  };
}
