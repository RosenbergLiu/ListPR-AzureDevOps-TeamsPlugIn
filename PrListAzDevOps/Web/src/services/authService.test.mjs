import test from "node:test";
import assert from "node:assert/strict";
import { InteractionRequiredAuthError, PublicClientApplication } from "@azure/msal-browser";
import {
  AZURE_DEVOPS_RESOURCE_ID,
  AZURE_DEVOPS_SCOPE,
  getAccessToken,
  initializeMsal,
  restoreUser,
  signInWithEntra,
  signInWithToken,
  signOut,
} from "./authService.ts";

let nextClient = 0;

function setup(t) {
  const values = new Map();
  const sessionStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: new URL("https://tab.example.test/tab?context=test#state"),
      crypto: globalThis.crypto,
      sessionStorage,
      get localStorage() {
        assert.fail("Authentication must not use localStorage");
      },
    },
  });
  t.after(() => {
    if (previousWindow) {
      Object.defineProperty(globalThis, "window", previousWindow);
    } else {
      delete globalThis.window;
    }
  });

  const identity = {
    name: "Saved user",
    username: "saved@example.test",
    authMethod: "entra",
    clientId: `test-client-${++nextClient}`,
    tenantId: "test-tenant",
    homeAccountId: "saved-account.test-tenant",
  };
  const account = {
    homeAccountId: identity.homeAccountId,
    localAccountId: "local-id",
    environment: "login.microsoftonline.com",
    tenantId: identity.tenantId,
    name: "Current user",
    username: "current@example.test",
  };
  const accounts = [{ ...account, homeAccountId: "another-account" }, account];
  const prototype = PublicClientApplication.prototype;
  const initialize = t.mock.method(prototype, "initialize", async () => {});
  const getAccount = t.mock.method(prototype, "getAccount", filter =>
    accounts.find(candidate => candidate.homeAccountId === filter.homeAccountId) ?? null);
  const silent = t.mock.method(prototype, "acquireTokenSilent", async () => ({
    account,
    accessToken: "synthetic-renewed-access-token",
  }));
  const login = t.mock.method(prototype, "loginPopup", async () =>
    assert.fail("Unexpected login popup"));
  const popup = t.mock.method(prototype, "acquireTokenPopup", async () =>
    assert.fail("Unexpected token popup"));
  const clearCache = t.mock.method(prototype, "clearCache", async ({ account: target }) => {
    const index = accounts.findIndex(candidate => candidate.homeAccountId === target.homeAccountId);
    if (index !== -1) accounts.splice(index, 1);
  });
  for (const method of ["logoutRedirect", "logoutPopup", "acquireTokenRedirect"]) {
    t.mock.method(prototype, method, async () => assert.fail("Unexpected auth navigation"));
  }
  for (const method of ["getAllAccounts", "getActiveAccount"]) {
    t.mock.method(prototype, method, () => assert.fail("Must look up the saved exact account"));
  }
  t.mock.method(globalThis, "fetch", async () => assert.fail("Unexpected network request"));
  return { identity, account, accounts, values, initialize, getAccount, silent, login, popup, clearCache };
}

test("Azure DevOps scope remains the public Azure DevOps resource", () => {
  assert.equal(AZURE_DEVOPS_RESOURCE_ID, "499b84ac-1321-427f-aa17-267ca6975798");
  assert.equal(AZURE_DEVOPS_SCOPE, `${AZURE_DEVOPS_RESOURCE_ID}/.default`);
});

test("restoration silently renews the exact saved account, without custom token storage", async t => {
  const state = setup(t);
  const user = await restoreUser(state.identity);
  assert.deepEqual(state.getAccount.mock.calls[0].arguments, [{ homeAccountId: state.identity.homeAccountId }]);
  assert.deepEqual(state.silent.mock.calls[0].arguments, [{
    account: state.account,
    scopes: [AZURE_DEVOPS_SCOPE],
  }]);
  assert.deepEqual(user, {
    ...state.identity,
    name: state.account.name,
    username: state.account.username,
    token: "synthetic-renewed-access-token",
  });
  assert.equal(state.login.mock.callCount(), 0);
  assert.equal(state.popup.mock.callCount(), 0);
  assert.equal([...state.values.values()].some(value => value.includes(user.token)), false);
});

test("each API token request uses silent acquisition rather than the expired profile token", async t => {
  const state = setup(t);
  const user = { ...state.identity, token: "synthetic-expired-token" };
  let renewal = 0;
  state.silent.mock.mockImplementation(async () => ({
    account: state.account,
    accessToken: `synthetic-current-token-${++renewal}`,
  }));
  assert.equal(await getAccessToken(user), "synthetic-current-token-1");
  assert.equal(await getAccessToken(user), "synthetic-current-token-2");
  assert.equal(state.initialize.mock.callCount(), 1);
  assert.equal(state.silent.mock.callCount(), 2);
  assert.equal(state.popup.mock.callCount(), 0);
});

test("missing saved account does not silently substitute another cached account", async t => {
  const state = setup(t);
  state.accounts.pop();
  await assert.rejects(restoreUser(state.identity), /no longer cached.*sign in again/i);
  assert.equal(state.silent.mock.callCount(), 0);
  assert.equal(state.login.mock.callCount(), 0);
  assert.equal(state.popup.mock.callCount(), 0);
});

test("empty saved account ID is rejected before an unfiltered MSAL lookup", async t => {
  const state = setup(t);
  await assert.rejects(restoreUser({ ...state.identity, homeAccountId: "" }), /account is missing/i);
  assert.equal(state.getAccount.mock.callCount(), 0);
  assert.equal(state.silent.mock.callCount(), 0);
});

test("a mismatched MSAL account result is not accepted", async t => {
  const state = setup(t);
  state.getAccount.mock.mockImplementation(() => state.accounts[0]);
  await assert.rejects(restoreUser(state.identity), /no longer cached/i);
  assert.equal(state.silent.mock.callCount(), 0);
});

test("interaction-required errors on restoration and API renewal never open a popup", async t => {
  const state = setup(t);
  const error = new InteractionRequiredAuthError("interaction_required");
  state.silent.mock.mockImplementation(async () => { throw error; });
  await assert.rejects(restoreUser(state.identity), thrown => thrown === error);
  await assert.rejects(getAccessToken({ ...state.identity, token: "expired" }), thrown => thrown === error);
  assert.equal(state.popup.mock.callCount(), 0);
  assert.equal(state.login.mock.callCount(), 0);
});

test("background network errors propagate rather than triggering interaction", async t => {
  const state = setup(t);
  const error = new Error("network unavailable");
  state.silent.mock.mockImplementation(async () => { throw error; });
  await assert.rejects(restoreUser(state.identity), thrown => thrown === error);
  await assert.rejects(getAccessToken({ ...state.identity, token: "expired" }), thrown => thrown === error);
  assert.equal(state.popup.mock.callCount(), 0);
});

test("concurrent initialization and restoration wait for the same ready client", async t => {
  const state = setup(t);
  let completeInitialization;
  state.initialize.mock.mockImplementation(() => new Promise(resolve => { completeInitialization = resolve; }));
  const first = initializeMsal(state.identity.clientId, state.identity.tenantId);
  let secondResolved = false;
  const second = initializeMsal(state.identity.clientId, state.identity.tenantId).then(msal => {
    secondResolved = true;
    return msal;
  });
  const restoring = restoreUser(state.identity);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.initialize.mock.callCount(), 1);
  assert.equal(secondResolved, false);
  assert.equal(state.getAccount.mock.callCount(), 0);
  assert.equal(state.silent.mock.callCount(), 0);
  completeInitialization();
  const [firstClient, secondClient, user] = await Promise.all([first, second, restoring]);
  assert.equal(firstClient, secondClient);
  assert.equal(user.homeAccountId, state.identity.homeAccountId);
});

test("normalized identical config reuses a client while changed client and tenant get distinct clients", async t => {
  const state = setup(t);
  const first = await initializeMsal(` ${state.identity.clientId} `, " tenant-one ");
  const equivalent = await initializeMsal(state.identity.clientId, "tenant-one");
  const otherClient = await initializeMsal(`${state.identity.clientId}-other`, "tenant-one");
  const otherTenant = await initializeMsal(state.identity.clientId, "tenant-two");
  const common = await initializeMsal(state.identity.clientId, " ");
  assert.equal(first, equivalent);
  assert.notEqual(first, otherClient);
  assert.notEqual(first, otherTenant);
  assert.notEqual(first, common);
  assert.equal(common, await initializeMsal(state.identity.clientId));
  assert.equal(common, await initializeMsal(state.identity.clientId, "common"));
  assert.equal(first, await initializeMsal(state.identity.clientId, "tenant-one"));
  assert.equal(first.getConfiguration().auth.clientId, state.identity.clientId);
  assert.equal(first.getConfiguration().auth.authority, "https://login.microsoftonline.com/tenant-one");
  assert.equal(otherTenant.getConfiguration().auth.authority, "https://login.microsoftonline.com/tenant-two");
  assert.equal(common.getConfiguration().auth.authority, "https://login.microsoftonline.com/common");
  assert.equal(first.getConfiguration().auth.redirectUri, "https://tab.example.test/tab");
  assert.equal(first.getConfiguration().cache.cacheLocation, "sessionStorage");
  assert.equal(first.getConfiguration().cache.storeAuthStateInCookie, false);
});

test("different configurations remain independent while initialization is in flight", async t => {
  const state = setup(t);
  const complete = [];
  state.initialize.mock.mockImplementation(() => new Promise(resolve => complete.push(resolve)));
  const first = initializeMsal(state.identity.clientId, "tenant-one");
  const second = initializeMsal(state.identity.clientId, "tenant-two");
  assert.equal(complete.length, 2);
  complete[1]();
  const secondClient = await second;
  complete[0]();
  const firstClient = await first;
  assert.notEqual(firstClient, secondClient);
  assert.equal(firstClient.getConfiguration().auth.authority, "https://login.microsoftonline.com/tenant-one");
  assert.equal(secondClient.getConfiguration().auth.authority, "https://login.microsoftonline.com/tenant-two");
});

test("failed initialization is shared but retryable and does not evict other configs", async t => {
  const state = setup(t);
  const error = new Error("initialization failed");
  let rejectInitialization;
  state.initialize.mock.mockImplementation(() => new Promise((_, reject) => { rejectInitialization = reject; }));
  const first = initializeMsal(state.identity.clientId, state.identity.tenantId);
  const second = initializeMsal(state.identity.clientId, state.identity.tenantId);
  const rejected = Promise.all([
    assert.rejects(first, thrown => thrown === error),
    assert.rejects(second, thrown => thrown === error),
  ]);
  state.initialize.mock.mockImplementation(async () => {});
  const unrelated = await initializeMsal(`${state.identity.clientId}-other`, state.identity.tenantId);
  rejectInitialization(error);
  await rejected;
  const retried = await initializeMsal(state.identity.clientId, state.identity.tenantId);
  assert.ok(retried instanceof PublicClientApplication);
  assert.equal(unrelated, await initializeMsal(`${state.identity.clientId}-other`, state.identity.tenantId));
  assert.equal(state.initialize.mock.callCount(), 3);
});

test("empty client IDs fail before constructing MSAL", async t => {
  const state = setup(t);
  await assert.rejects(initializeMsal(" \t "), /client ID is required/i);
  assert.equal(state.initialize.mock.callCount(), 0);
});

test("explicit Entra sign-in includes the identity configuration needed for restoration", async t => {
  const state = setup(t);
  state.login.mock.mockImplementation(async () => ({ account: state.account, accessToken: "synthetic-login-token" }));
  const user = await signInWithEntra(` ${state.identity.clientId} `, ` ${state.identity.tenantId} `);
  assert.deepEqual(user, {
    ...state.identity,
    name: state.account.name,
    username: state.account.username,
    token: "synthetic-login-token",
  });
  assert.deepEqual(state.login.mock.calls[0].arguments[0].scopes, [
    AZURE_DEVOPS_SCOPE, "openid", "profile", "offline_access",
  ]);
  assert.equal(state.silent.mock.callCount(), 0);
});

test("explicit sign-in uses silent acquisition when login has no access token", async t => {
  const state = setup(t);
  state.login.mock.mockImplementation(async () => ({ account: state.account, accessToken: "" }));
  const user = await signInWithEntra(state.identity.clientId, state.identity.tenantId);
  assert.equal(user.token, "synthetic-renewed-access-token");
  assert.equal(state.silent.mock.calls[0].arguments[0].account, state.account);
  assert.equal(state.popup.mock.callCount(), 0);
});

test("only interaction-required errors during explicit sign-in permit a token popup", async t => {
  const state = setup(t);
  state.login.mock.mockImplementation(async () => ({ account: state.account, accessToken: "" }));
  state.silent.mock.mockImplementation(async () => { throw new InteractionRequiredAuthError("consent_required"); });
  state.popup.mock.mockImplementation(async () => ({ account: state.account, accessToken: "synthetic-popup-token" }));
  const user = await signInWithEntra(state.identity.clientId, state.identity.tenantId);
  assert.equal(user.token, "synthetic-popup-token");
  assert.deepEqual(state.popup.mock.calls[0].arguments, [{
    account: state.account,
    scopes: [AZURE_DEVOPS_SCOPE],
  }]);
});

test("ordinary token errors during explicit sign-in do not cause a second popup", async t => {
  const state = setup(t);
  const error = new Error("network failure");
  state.login.mock.mockImplementation(async () => ({ account: state.account, accessToken: "" }));
  state.silent.mock.mockImplementation(async () => { throw error; });
  await assert.rejects(signInWithEntra(state.identity.clientId), thrown => thrown === error);
  assert.equal(state.popup.mock.callCount(), 0);
});

test("login cancellation is surfaced without another popup", async t => {
  const state = setup(t);
  const error = new Error("user_cancelled");
  state.login.mock.mockImplementation(async () => { throw error; });
  await assert.rejects(signInWithEntra(state.identity.clientId), thrown => thrown === error);
  assert.equal(state.silent.mock.callCount(), 0);
  assert.equal(state.popup.mock.callCount(), 0);
});

test("Entra sign-in rejects a missing account and restoration rejects an empty token", async t => {
  const state = setup(t);
  state.login.mock.mockImplementation(async () => ({ account: null, accessToken: "synthetic-token" }));
  await assert.rejects(signInWithEntra(state.identity.clientId), /did not return an account/i);
  state.silent.mock.mockImplementation(async () => ({ account: state.account, accessToken: " " }));
  await assert.rejects(restoreUser(state.identity), /did not return.*access token/i);
});

test("sign-out clears only the saved account locally and prevents subsequent restoration", async t => {
  const state = setup(t);
  const user = { ...state.identity, token: "synthetic-token" };
  await signOut(user);
  assert.deepEqual(state.clearCache.mock.calls[0].arguments, [{ account: state.account }]);
  assert.equal(state.accounts.length, 1);
  assert.equal(state.accounts[0].homeAccountId, "another-account");
  await assert.rejects(restoreUser(state.identity), /no longer cached/i);
  await signOut(user);
  assert.equal(state.clearCache.mock.callCount(), 1);
  assert.equal(state.login.mock.callCount(), 0);
  assert.equal(state.popup.mock.callCount(), 0);
});

test("sign-out cache errors propagate to the caller", async t => {
  const state = setup(t);
  const error = new Error("cache clearing failed");
  state.clearCache.mock.mockImplementation(async () => { throw error; });
  await assert.rejects(signOut({ ...state.identity, token: "synthetic-token" }), thrown => thrown === error);
});

test("PAT sign-in, restoration, token acquisition and sign-out use no MSAL or storage", async t => {
  const state = setup(t);
  const user = signInWithToken(" synthetic-pat ", "PAT test user");
  assert.deepEqual(user, {
    name: "PAT test user",
    username: "PAT test user",
    authMethod: "pat",
    token: "synthetic-pat",
  });
  assert.equal(signInWithToken("synthetic-pat").username, "Personal Access Token User");
  assert.deepEqual(await restoreUser(user), user);
  assert.equal(await getAccessToken(user), "synthetic-pat");
  await signOut(user);
  assert.equal(state.initialize.mock.callCount(), 0);
  assert.equal(state.clearCache.mock.callCount(), 0);
  assert.equal(state.values.size, 0);
});

test("empty PATs are rejected at sign-in, restoration and API access", async t => {
  setup(t);
  for (const token of ["", " \t\n "]) {
    assert.throws(() => signInWithToken(token), /personal access token is required/i);
    const user = { name: "PAT user", username: "PAT user", authMethod: "pat", token };
    await assert.rejects(restoreUser(user), /personal access token is required/i);
    await assert.rejects(getAccessToken(user), /personal access token is required/i);
  }
});
