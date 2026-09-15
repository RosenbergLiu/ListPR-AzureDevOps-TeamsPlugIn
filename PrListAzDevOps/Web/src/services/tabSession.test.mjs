import test from "node:test";
import assert from "node:assert/strict";
import {
  clearSession, createSession, readSession, resetPullRequests, sameIdentity, savedIdentity,
  selectOrganization, selectPage, selectProject, writeSession,
} from "./tabSession.ts";

class MemoryStorage {
  values = new Map();
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, value); }
  removeItem(key) { this.values.delete(key); }
}

const patUser = { authMethod: "pat", name: "Test user", username: "test", token: "synthetic-pat" };
const entraUser = {
  authMethod: "entra", name: "Test user", username: "test", token: "synthetic-access-token",
  clientId: "test-client", tenantId: "test-tenant", homeAccountId: "test-account",
};
const repository = { id: "repo-id", name: "test-repo", url: "https://example.invalid/repo", project: { id: "project-id", name: "test-project" } };

function loadedSession(count = 40) {
  const session = createSession();
  session.identity = savedIdentity(patUser);
  Object.assign(session.view, {
    organization: "test-org", selectedProject: "test-project", selectedRepository: "repo-id",
    projects: [repository.project], repositories: [repository], hasMore: true,
    projectsStatus: "ready", repositoriesStatus: "ready", prsStatus: "ready",
    scrollY: 700, theme: "dark",
    pullRequests: Array.from({ length: count }, (_, index) => ({
      pullRequestId: index + 1, status: "active", title: `Synthetic PR ${index + 1}`,
      repository, creationDate: "2026-01-01T00:00:00Z", sourceRefName: "refs/heads/feature",
      targetRefName: "refs/heads/main", createdBy: { id: "user-id", displayName: "Test user" },
      reviewers: [{ id: "reviewer-id", displayName: "Reviewer", vote: 10 }],
      isDraft: index % 2 === 0, url: "https://example.invalid/pr",
    })),
  });
  return session;
}

test("tab remount restores sign-in, filters, all loaded pages, drafts, theme and scroll", () => {
  const storage = new MemoryStorage();
  const original = loadedSession();
  writeSession("test-user:test-tab", original, storage);
  assert.deepEqual(readSession("test-user:test-tab", storage), original);
  assert.equal(readSession("test-user:test-tab", storage).view.pullRequests.length, 40);
});

test("settings navigation and repository search survive tab remounts", () => {
  const storage = new MemoryStorage();
  const original = loadedSession();
  original.view.page = "settings";
  original.view.repositorySearch = " TEST ";
  writeSession("test", original, storage);
  assert.deepEqual(readSession("test", storage), original);
});

test("sessions saved before Settings retain their selections, sign-in and loaded pages", () => {
  const storage = new MemoryStorage();
  const original = loadedSession();
  const legacy = structuredClone(original);
  delete legacy.view.page;
  delete legacy.view.repositorySearch;
  writeSession("test", legacy, storage);
  assert.deepEqual(readSession("test", storage), original);
});

test("invalid saved settings navigation and search values are reported", () => {
  const storage = new MemoryStorage();
  for (const patch of [{ page: "unknown" }, { page: null }, { repositorySearch: 123 }, { repositorySearch: null }]) {
    const original = loadedSession();
    Object.assign(original.view, patch);
    writeSession("test", original, storage);
    assert.throws(() => readSession("test", storage), /incompatible/);
  }
});

test("page navigation preserves selection, search and loaded PR pages without reloading", () => {
  const view = loadedSession().view;
  view.repositorySearch = "test";
  const settings = selectPage(view, "settings");
  assert.deepEqual(settings, { ...view, page: "settings", scrollY: 0 });
  assert.equal(settings.pullRequests, view.pullRequests);
  assert.deepEqual(selectPage(settings, "pullRequests"), { ...view, scrollY: 0 });
  assert.equal(selectPage(view, "pullRequests"), view);
});

test("cached empty and exact-page results preserve their completion status", () => {
  const storage = new MemoryStorage();
  for (const count of [0, 1, 20, 21, 40, 41]) {
    const original = loadedSession(count);
    original.view.hasMore = false;
    writeSession("test", original, storage);
    const restored = readSession("test", storage);
    assert.equal(restored.view.prsStatus, "ready");
    assert.equal(restored.view.pullRequests.length, count);
    assert.equal(restored.view.hasMore, false);
  }
});

test("Entra identity stores account/configuration but never duplicates its access token", () => {
  const storage = new MemoryStorage();
  const session = loadedSession();
  session.identity = savedIdentity(entraUser);
  writeSession("test", session, storage);
  const restored = readSession("test", storage);
  assert.equal(restored.identity.homeAccountId, entraUser.homeAccountId);
  assert.equal("token" in restored.identity, false);
  assert.equal([...storage.values.values()].some(value => value.includes(entraUser.token)), false);
});

test("Teams user/tab scopes do not share credentials or PR state", () => {
  const storage = new MemoryStorage();
  writeSession("tenant:user-a:tab-a", loadedSession(), storage);
  assert.deepEqual(readSession("tenant:user-b:tab-a", storage), createSession());
  assert.deepEqual(readSession("tenant:user-a:tab-b", storage), createSession());
});

test("sign-out deletes only this tab session, not other applications' storage", () => {
  const storage = new MemoryStorage();
  storage.setItem("unrelated", "preserve");
  writeSession("test", loadedSession(), storage);
  clearSession("test", storage);
  assert.deepEqual(readSession("test", storage), createSession());
  assert.equal(storage.getItem("unrelated"), "preserve");
});

test("missing state initializes safely and malformed/incompatible state is reported", () => {
  const storage = new MemoryStorage();
  assert.deepEqual(readSession("test", storage), createSession());
  writeSession("test", createSession(), storage);
  const key = [...storage.values.keys()][0];
  for (const value of ["{broken", "null", '{"version":99}', JSON.stringify({ ...createSession(), view: {} })]) {
    storage.setItem(key, value);
    assert.throws(() => readSession("test", storage), /saved tab session/);
  }
});

test("invalid cached PR payloads are rejected rather than crashing the restored UI", () => {
  const storage = new MemoryStorage();
  const session = loadedSession();
  session.view.pullRequests[0].createdBy.displayName = 123;
  writeSession("test", session, storage);
  assert.throws(() => readSession("test", storage), /incompatible/);
});

test("storage denial and quota failures propagate for a visible persistence warning", () => {
  const storage = {
    getItem() { throw new DOMException("Storage unavailable", "SecurityError"); },
    setItem() { throw new DOMException("Storage full", "QuotaExceededError"); },
    removeItem() { throw new DOMException("Storage unavailable", "SecurityError"); },
  };
  assert.throws(() => readSession("test", storage), { name: "SecurityError" });
  assert.throws(() => writeSession("test", createSession(), storage), { name: "QuotaExceededError" });
  assert.throws(() => clearSession("test", storage), { name: "SecurityError" });
});

test("organization/project/filter changes reset only dependent state", () => {
  const view = loadedSession().view;
  view.page = "settings";
  view.repositorySearch = "test";
  const nextProject = selectProject(view, "another-project");
  assert.equal(nextProject.organization, view.organization);
  assert.deepEqual(nextProject.projects, view.projects);
  assert.deepEqual(nextProject.repositories, []);
  assert.equal(nextProject.selectedRepository, "");
  assert.equal(nextProject.repositorySearch, "");
  assert.equal(nextProject.page, "settings");
  assert.deepEqual(nextProject.pullRequests, []);
  assert.equal(nextProject.prsStatus, "idle");
  const nextOrganization = selectOrganization(view, "another-org");
  assert.equal(nextOrganization.selectedProject, "");
  assert.deepEqual(nextOrganization.projects, []);
  assert.equal(nextOrganization.projectsStatus, "idle");
  assert.equal(nextOrganization.repositorySearch, "");
  assert.equal(nextOrganization.selectedRepository, "");
  const refreshed = resetPullRequests(view);
  assert.equal(refreshed.selectedRepository, view.selectedRepository);
  assert.equal(refreshed.repositorySearch, view.repositorySearch);
  assert.equal(refreshed.scrollY, 0);
  assert.equal(refreshed.hasMore, false);
});

test("returning with the same account retains state but changing account/configuration does not", () => {
  assert.equal(sameIdentity(savedIdentity(entraUser), savedIdentity(entraUser)), true);
  assert.equal(sameIdentity(savedIdentity(entraUser), { ...savedIdentity(entraUser), homeAccountId: "other-account" }), false);
  assert.equal(sameIdentity(savedIdentity(entraUser), { ...savedIdentity(entraUser), clientId: "other-client" }), false);
  assert.equal(sameIdentity(patUser, { ...patUser, token: "other-synthetic-pat" }), false);
  assert.equal(sameIdentity(null, patUser), false);
});

test("in-flight pagination resumes from saved rows instead of resetting or staying loading", () => {
  const storage = new MemoryStorage();
  const original = loadedSession();
  original.view.prsStatus = "idle";
  writeSession("test", original, storage);
  const restored = readSession("test", storage);
  assert.equal(restored.view.prsStatus, "idle");
  assert.equal(restored.view.pullRequests.length, 40);
});

test("unfinished sign-in retains non-secret form values without storing a password draft", () => {
  const storage = new MemoryStorage();
  const original = createSession();
  original.view.login = { isOpen: true, authTab: "entra", clientId: "test-client", tenantId: "test-tenant" };
  writeSession("test", original, storage);
  assert.deepEqual(readSession("test", storage).view.login, original.view.login);
});
