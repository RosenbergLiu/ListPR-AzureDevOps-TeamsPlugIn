import { InteractionRequiredAuthError, PublicClientApplication } from "@azure/msal-browser";
import type { AccountInfo, Configuration, PopupRequest } from "@azure/msal-browser";
import type { EntraIdentity, SavedIdentity, UserProfile } from "../types/azureDevOps";

// Azure DevOps Entra Resource ID & Scope
export const AZURE_DEVOPS_RESOURCE_ID = "499b84ac-1321-427f-aa17-267ca6975798";
export const AZURE_DEVOPS_SCOPE = `${AZURE_DEVOPS_RESOURCE_ID}/.default`;

const msalClients = new Map<string, Promise<PublicClientApplication>>();

export async function initializeMsal(clientId: string, tenantId?: string): Promise<PublicClientApplication> {
  const normalizedClientId = clientId.trim();
  if (!normalizedClientId) {
    throw new Error("An Entra application client ID is required.");
  }

  const authority = `https://login.microsoftonline.com/${tenantId?.trim() || "common"}`;
  const redirectUri = window.location.origin + window.location.pathname;
  const configKey = JSON.stringify([normalizedClientId, authority, redirectUri]);
  const existingClient = msalClients.get(configKey);
  if (existingClient) {
    return existingClient;
  }

  const msalConfig: Configuration = {
    auth: {
      clientId: normalizedClientId,
      authority,
      redirectUri,
    },
    cache: {
      cacheLocation: "sessionStorage",
      storeAuthStateInCookie: false,
    },
  };

  const msal = new PublicClientApplication(msalConfig);
  // Share initialization, not an instance that concurrent mounts could use too early.
  const initializedClient = msal.initialize()
    .then(() => msal)
    .catch((error: unknown) => {
      msalClients.delete(configKey);
      throw error;
    });
  msalClients.set(configKey, initializedClient);
  return initializedClient;
}

function findAccount(msal: PublicClientApplication, identity: EntraIdentity): AccountInfo | null {
  if (!identity.homeAccountId) {
    throw new Error("The saved Entra account is missing. Please sign in again.");
  }
  const account = msal.getAccount({ homeAccountId: identity.homeAccountId });
  return account?.homeAccountId === identity.homeAccountId ? account : null;
}

function requireAccessToken(token: string): string {
  if (!token.trim()) {
    throw new Error("Entra did not return an Azure DevOps access token. Please sign in again.");
  }
  return token;
}

function createEntraProfile(identity: EntraIdentity, account: AccountInfo, token: string): UserProfile {
  return {
    name: account.name || identity.name,
    username: account.username || identity.username,
    authMethod: "entra",
    clientId: identity.clientId.trim(),
    tenantId: identity.tenantId?.trim() || undefined,
    homeAccountId: account.homeAccountId,
    token: requireAccessToken(token),
  };
}

export async function signInWithEntra(clientId: string, tenantId?: string): Promise<UserProfile> {
  const msal = await initializeMsal(clientId, tenantId);

  const loginRequest: PopupRequest = {
    scopes: [AZURE_DEVOPS_SCOPE, "openid", "profile", "offline_access"],
  };

  const loginResponse = await msal.loginPopup(loginRequest);
  const account = loginResponse.account;
  if (!account?.homeAccountId) {
    throw new Error("Entra did not return an account. Please sign in again.");
  }

  let token = loginResponse.accessToken;
  if (!token) {
    const tokenResponse = await msal.acquireTokenSilent({
      account,
      scopes: [AZURE_DEVOPS_SCOPE],
    }).catch((error: unknown) => {
      if (!(error instanceof InteractionRequiredAuthError)) {
        throw error;
      }
      return msal.acquireTokenPopup({
        account,
        scopes: [AZURE_DEVOPS_SCOPE],
      });
    });
    token = tokenResponse.accessToken;
  }

  return createEntraProfile({
    name: "Entra User",
    username: "",
    authMethod: "entra",
    clientId,
    tenantId,
    homeAccountId: account.homeAccountId,
  }, account, token);
}

export function signInWithToken(token: string, username = "Personal Access Token User"): UserProfile {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    throw new Error("A personal access token is required.");
  }
  return {
    name: username,
    username: username,
    token: normalizedToken,
    authMethod: "pat",
  };
}

export async function restoreUser(identity: SavedIdentity): Promise<UserProfile> {
  if (identity.authMethod === "pat") {
    return { ...signInWithToken(identity.token, identity.username), name: identity.name };
  }

  const msal = await initializeMsal(identity.clientId, identity.tenantId);
  const account = findAccount(msal, identity);
  if (!account) {
    throw new Error("The saved Entra account is no longer cached. Please sign in again.");
  }

  const response = await msal.acquireTokenSilent({
    account,
    scopes: [AZURE_DEVOPS_SCOPE],
  });
  return createEntraProfile(identity, account, response.accessToken);
}

export async function getAccessToken(user: UserProfile): Promise<string> {
  // MSAL checks expiry and renews silently; the profile's token is not a token cache.
  return (await restoreUser(user)).token;
}

export async function signOut(user: UserProfile): Promise<void> {
  if (user.authMethod === "pat") {
    return;
  }

  const msal = await initializeMsal(user.clientId, user.tenantId);
  const account = findAccount(msal, user);
  if (account) {
    // Only clear this account locally; redirect/popup logout would sign out of Teams.
    await msal.clearCache({ account });
  }
}
