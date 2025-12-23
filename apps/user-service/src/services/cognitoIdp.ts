import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
  ListUsersCommand,
  AdminResetUserPasswordCommand,
  SignUpCommand,
  ConfirmSignUpCommand,
  ResendConfirmationCodeCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  AssociateSoftwareTokenCommand,
  VerifySoftwareTokenCommand,
  SetUserMFAPreferenceCommand
} from "@aws-sdk/client-cognito-identity-provider";

export class CognitoIdp {
  private client: CognitoIdentityProviderClient;

  constructor(region: string) {
    this.client = new CognitoIdentityProviderClient({ region });
  }

  listUsers(userPoolId: string, limit = 20, paginationToken?: string) {
    return this.client.send(new ListUsersCommand({ UserPoolId: userPoolId, Limit: limit, PaginationToken: paginationToken }));
  }

  getUser(userPoolId: string, username: string) {
    return this.client.send(new AdminGetUserCommand({ UserPoolId: userPoolId, Username: username }));
  }

  createUser(userPoolId: string, email: string, tempPassword?: string) {
    return this.client.send(new AdminCreateUserCommand({
      UserPoolId: userPoolId,
      Username: email,
      TemporaryPassword: tempPassword,
      UserAttributes: [
        { Name: "email", Value: email },
        { Name: "email_verified", Value: "true" }
      ]
    }));
  }

  updateUser(userPoolId: string, username: string, attrs: Record<string, string>) {
    return this.client.send(new AdminUpdateUserAttributesCommand({
      UserPoolId: userPoolId,
      Username: username,
      UserAttributes: Object.entries(attrs).map(([Name, Value]) => ({ Name, Value }))
    }));
  }

  deleteUser(userPoolId: string, username: string) {
    return this.client.send(new AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: username }));
  }

  enableUser(userPoolId: string, username: string) {
    return this.client.send(new AdminEnableUserCommand({ UserPoolId: userPoolId, Username: username }));
  }

  disableUser(userPoolId: string, username: string) {
    return this.client.send(new AdminDisableUserCommand({ UserPoolId: userPoolId, Username: username }));
  }

  resetPassword(userPoolId: string, username: string) {
    return this.client.send(new AdminResetUserPasswordCommand({ UserPoolId: userPoolId, Username: username }));
  }

  signUp(appClientId: string, email: string, password: string, attrs: Record<string, string>) {
    return this.client.send(new SignUpCommand({
      ClientId: appClientId,
      Username: email,
      Password: password,
      UserAttributes: Object.entries(attrs).map(([Name, Value]) => ({ Name, Value }))
    }));
  }

  confirmSignUp(appClientId: string, email: string, code: string) {
    return this.client.send(new ConfirmSignUpCommand({ ClientId: appClientId, Username: email, ConfirmationCode: code }));
  }

  resendCode(appClientId: string, email: string) {
    return this.client.send(new ResendConfirmationCodeCommand({ ClientId: appClientId, Username: email }));
  }

  forgotPassword(appClientId: string, email: string) {
    return this.client.send(new ForgotPasswordCommand({ ClientId: appClientId, Username: email }));
  }

  confirmForgotPassword(appClientId: string, email: string, code: string, newPassword: string) {
    return this.client.send(new ConfirmForgotPasswordCommand({
      ClientId: appClientId,
      Username: email,
      ConfirmationCode: code,
      Password: newPassword
    }));
  }

  associateSoftwareToken(accessToken: string) {
    return this.client.send(new AssociateSoftwareTokenCommand({ AccessToken: accessToken }));
  }

  verifySoftwareToken(accessToken: string, userCode: string, friendlyName?: string) {
    return this.client.send(new VerifySoftwareTokenCommand({
      AccessToken: accessToken,
      UserCode: userCode,
      FriendlyDeviceName: friendlyName
    }));
  }

  setTotpMfa(accessToken: string, enabled: boolean) {
    return this.client.send(new SetUserMFAPreferenceCommand({
      AccessToken: accessToken,
      SoftwareTokenMfaSettings: { Enabled: enabled, PreferredMfa: enabled }
    }));
  }
}
