import test from "node:test";
import assert from "node:assert/strict";
import {
  addRepository as addEntry, clearSession, createSession, readSession, removeRepository, repositoryFromPicker, resetPullRequests, sameIdentity, savedIdentity,
  selectOrganization, selectProject, writeSession, changePrFilters,
} from "./tabSession.ts";
import { getRepositoryKey } from "./repositoryList.ts";
import { DEFAULT_PR_FILTERS } from "./prFilters.ts";

function addRepository(view, repositoryId) {
  return addEntry(view, repositoryFromPicker(view, repositoryId));
}

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
const entry = {
  organization: "test-org", projectId: "project-id", projectName: "test-project",
  repositoryId: "repo-id", repositoryName: "test-repo",
};
const entryKey = getRepositoryKey(entry);

function loadedSession(count = 40) {
  const session = createSession();
  session.identity = savedIdentity(patUser);
  Object.assign(session.view, {
    organization: "test-org", selectedProject: "test-project", repositoryList: [entry],
    repositorySearch: "test-repo", repositoryOffsets: { [entryKey]: count },
    projects: [repository.project], repositories: [repository], hasMore: true,
    projectsStatus: "ready", repositoriesStatus: "ready", prsStatus: "ready",
    scrollY: 700, theme: "dark",
    pullRequests: Array.from({ length: count }, (_, index) => ({
      pullRequestId: index + 1, status: "active", title: `Synthetic PR ${index + 1}`, organization: "test-org",
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

test("browsing organizations and projects preserves the saved list and loaded PR pages", () => {
  const view = loadedSession().view;
  const nextProject = selectProject(view, "another-project");
  assert.equal(nextProject.organization, view.organization);
  assert.deepEqual(nextProject.projects, view.projects);
  assert.deepEqual(nextProject.repositories, []);
  assert.deepEqual(nextProject.repositoryList, view.repositoryList);
  assert.equal(nextProject.repositorySearch, "");
  assert.deepEqual(nextProject.repositoryOffsets, view.repositoryOffsets);
  assert.deepEqual(nextProject.pullRequests, view.pullRequests);
  assert.equal(nextProject.prsStatus, "ready");
  const nextOrganization = selectOrganization(view, "another-org");
  assert.equal(nextOrganization.selectedProject, "");
  assert.deepEqual(nextOrganization.projects, []);
  assert.equal(nextOrganization.projectsStatus, "idle");
  assert.deepEqual(nextOrganization.repositoryList, view.repositoryList);
  assert.deepEqual(nextOrganization.pullRequests, view.pullRequests);
  const refreshed = resetPullRequests(view);
  assert.deepEqual(refreshed.repositoryList, view.repositoryList);
  assert.equal(refreshed.repositorySearch, view.repositorySearch);
  assert.deepEqual(refreshed.repositoryOffsets, {});
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

test("settings page, multi-project repository list, search and scoped offsets survive remount", () => {
  const storage = new MemoryStorage();
  const original = loadedSession();
  const second = { ...entry, organization: "second-org", projectId: "second-project", repositoryName: "second-repo" };
  original.view.page = "settings";
  original.view.settingsScrollY = 240;
  original.view.repositoryList = [entry, second];
  original.view.repositorySearch = "second";
  original.view.repositoryOffsets = { [entryKey]: 23, [getRepositoryKey(second)]: 17 };
  writeSession("test", original, storage);
  assert.deepEqual(readSession("test", storage), original);
});

test("adding a repository appends to the list, deduplicates, and resets PR pages only on changes", () => {
  const view = loadedSession().view;
  assert.equal(addRepository(view, "repo-id"), view);
  const picker = { ...view, repositories: [...view.repositories, { ...repository, id: "second-repo" }] };
  const selected = addRepository(picker, "second-repo");
  assert.deepEqual(selected.repositoryList.map(item => item.repositoryId), ["repo-id", "second-repo"]);
  assert.equal(selected.repositorySearch, view.repositorySearch);
  assert.deepEqual(selected.repositoryOffsets, {});
  assert.deepEqual(selected.pullRequests, []);
  assert.equal(selected.prsStatus, "idle");
  assert.equal(addRepository(selected, "second-repo"), selected);
  assert.equal(addRepository({ ...selected, organization: "TEST-ORG" }, "second-repo").repositoryList.length, 2);
});

test("removing a repository resets paging; removing the last leaves an explicit empty ready list", () => {
  const view = loadedSession().view;
  const removed = removeRepository(view, entryKey);
  assert.deepEqual(removed.repositoryList, []);
  assert.deepEqual(removed.pullRequests, []);
  assert.deepEqual(removed.repositoryOffsets, {});
  assert.equal(removed.hasMore, false);
  assert.equal(removed.prsStatus, "ready");
  assert.equal(removeRepository(view, "already-removed"), view);
});

test("same repository IDs in different organizations are distinct saved entries", () => {
  const view = loadedSession().view;
  const selected = addRepository({ ...view, organization: "second-org" }, "repo-id");
  assert.equal(selected.repositoryList.length, 2);
  assert.equal(new Set(selected.repositoryList.map(getRepositoryKey)).size, 2);
  assert.equal(removeRepository(selected, entryKey).repositoryList[0].organization, "second-org");
});

test("invalid picker input produces an actionable error rather than an invalid list entry", () => {
  const view = loadedSession().view;
  assert.throws(() => addRepository(view, "not-available"), /Select an available project and repository/);
  assert.throws(() => addRepository({ ...view, organization: "" }, "repo-id"), /Select an available/);
  assert.throws(() => addRepository({ ...view, selectedProject: "" }, "repo-id"), /Select an available/);
});

test("picker metadata is captured independently so queued additions compose without replacing prior entries", () => {
  const view = {
    ...createSession().view, organization: "test-org", selectedProject: "test-project",
    projects: [repository.project], repositories: [repository, { ...repository, id: "second-repo", project: undefined }],
  };
  const first = repositoryFromPicker(view, "repo-id");
  const second = repositoryFromPicker(view, "second-repo");
  const added = addEntry(addEntry(view, first), second);
  assert.deepEqual(added.repositoryList.map(item => item.repositoryId), ["repo-id", "second-repo"]);
  assert.equal(second.projectId, "project-id");
});

function legacySession(version, selectedRepositories) {
  const original = loadedSession();
  const { repositoryList, page, settingsScrollY, repositoryOffsets, ...legacyView } = original.view;
  return {
    ...original, version,
    view: {
      ...legacyView,
      pullRequests: original.view.pullRequests.map(({ organization, ...pr }) => pr),
      ...(version === 1 ? { selectedRepository: selectedRepositories[0] ?? "" } : { selectedRepositories }),
      repositoryOffsets: { [selectedRepositories[0] || "*"]: 40 },
    },
  };
}

test("v1 and v2 explicit selections migrate without losing sign-in or loaded pages", () => {
  const storage = new MemoryStorage();
  for (const version of [1, 2]) {
    const original = loadedSession();
    storage.setItem("pr-list.tab-session.v1:test", JSON.stringify(legacySession(version, ["repo-id"])));
    const migrated = readSession("test", storage);
    assert.equal(migrated.version, 4);
    assert.deepEqual(migrated.identity, original.identity);
    assert.deepEqual(migrated.view.repositoryList, [entry]);
    assert.equal(migrated.view.repositorySearch, version === 1 ? "" : original.view.repositorySearch);
    assert.deepEqual(migrated.view.repositoryOffsets, { [entryKey]: 40 });
    assert.deepEqual(migrated.view.pullRequests, original.view.pullRequests);
    assert.equal(migrated.view.prsStatus, "ready");
    writeSession("test", migrated, storage);
    assert.deepEqual(readSession("test", storage), migrated);
  }
});

test("legacy all-repository results are discarded rather than shown outside the saved list", () => {
  const storage = new MemoryStorage();
  for (const version of [1, 2]) {
    storage.setItem("pr-list.tab-session.v1:test", JSON.stringify(legacySession(version, [])));
    const migrated = readSession("test", storage);
    assert.deepEqual(migrated.view.repositoryList, []);
    assert.deepEqual(migrated.view.pullRequests, []);
    assert.deepEqual(migrated.view.repositoryOffsets, {});
    assert.equal(migrated.view.prsStatus, "ready");
    assert.equal(migrated.view.hasMore, false);
    assert.equal(migrated.view.scrollY, 0);
    assert.deepEqual(migrated.identity, savedIdentity(patUser));
  }
});

test("v2 multi-selection migration keeps both repositories and their independent offsets", () => {
  const storage = new MemoryStorage();
  const legacy = legacySession(2, ["repo-id", "second-repo"]);
  legacy.view.repositories.push({ ...repository, id: "second-repo", name: "second-name" });
  legacy.view.repositoryOffsets = { "repo-id": 23, "second-repo": 17 };
  storage.setItem("pr-list.tab-session.v1:test", JSON.stringify(legacy));
  const migrated = readSession("test", storage);
  assert.deepEqual(migrated.view.repositoryList.map(item => item.repositoryName), ["test-repo", "second-name"]);
  assert.deepEqual(migrated.view.repositoryOffsets, {
    [entryKey]: 23, [getRepositoryKey({ organization: "test-org", repositoryId: "second-repo" })]: 17,
  });
});

test("migration retains selected IDs even when picker metadata is unavailable", () => {
  const storage = new MemoryStorage();
  const legacy = legacySession(2, ["repo-id", "unavailable-id"]);
  legacy.view.repositories = [];
  legacy.view.pullRequests = [];
  legacy.view.repositoryOffsets = {};
  storage.setItem("pr-list.tab-session.v1:test", JSON.stringify(legacy));
  const migrated = readSession("test", storage);
  assert.deepEqual(migrated.view.repositoryList.map(item => item.repositoryId), ["repo-id", "unavailable-id"]);
  assert.equal(migrated.view.repositoryList[1].repositoryName, "unavailable-id");
});

test("invalid saved selections and offsets cannot be restored as a usable session", () => {
  const storage = new MemoryStorage();
  for (const patch of [
    { repositoryList: "repo-id" },
    { repositoryList: [entry, entry] },
    { repositoryList: [null] },
    { repositoryList: [{ ...entry, organization: "" }] },
    { repositoryList: [{ ...entry, projectId: null }] },
    { page: "unknown" },
    { repositorySearch: null },
    { repositoryOffsets: [] },
    { repositoryOffsets: { [entryKey]: -1 } },
    { repositoryOffsets: { [entryKey]: 0.5 } },
    { repositoryOffsets: { [entryKey]: "20" } },
    { repositoryOffsets: { "not-listed": 20 } },
  ]) {
    const session = loadedSession();
    Object.assign(session.view, patch);
    writeSession("test", session, storage);
    assert.throws(() => readSession("test", storage), /incompatible/);
  }
});

test("cached PRs from outside the saved list cannot be restored onto the PR page", () => {
  const storage = new MemoryStorage();
  for (const patch of [{ organization: "not-listed-org" }, { organization: undefined }, { repository: { ...repository, id: "not-listed-repo" } }]) {
    const session = loadedSession();
    Object.assign(session.view.pullRequests[0], patch);
    writeSession("test", session, storage);
    assert.throws(() => readSession("test", storage), /incompatible/);
  }
});

test("PR filters default to showing drafts without restricting creator or reviewer", () => {
  assert.deepEqual(createSession().view.prFilters, {
    showDrafts: true, createdByMeOnly: false, reviewerContainsMeOnly: false,
  });
});

test("changing each toggle resets all PR paging but retains repositories, Settings and other filters", () => {
  for (const key of Object.keys(DEFAULT_PR_FILTERS)) {
    const view = loadedSession().view;
    const changed = changePrFilters(view, { [key]: !view.prFilters[key] });
    assert.deepEqual(changed.prFilters, { ...view.prFilters, [key]: !view.prFilters[key] });
    assert.deepEqual(changed.pullRequests, []);
    assert.deepEqual(changed.repositoryOffsets, {});
    assert.equal(changed.prsStatus, "idle");
    assert.equal(changed.hasMore, false);
    assert.equal(changed.scrollY, 0);
    assert.equal(changed.repositoryList, view.repositoryList);
    assert.equal(changed.repositorySearch, view.repositorySearch);
    assert.equal(changePrFilters(view, { [key]: view.prFilters[key] }), view);
  }
});

test("every combination of PR toggles survives Settings navigation and session restoration", () => {
  const storage = new MemoryStorage();
  for (let bits = 0; bits < 8; bits++) {
    const session = loadedSession();
    session.view = changePrFilters(session.view, {
      showDrafts: Boolean(bits & 1), createdByMeOnly: Boolean(bits & 2), reviewerContainsMeOnly: Boolean(bits & 4),
    });
    session.view.page = "settings";
    writeSession("test", session, storage);
    const restored = readSession("test", storage);
    assert.deepEqual(restored.view.prFilters, session.view.prFilters);
    assert.deepEqual(resetPullRequests(restored.view).prFilters, session.view.prFilters);
    assert.deepEqual(selectOrganization(restored.view, "other-org").prFilters, session.view.prFilters);
  }
});

test("v3 sessions acquire safe filter defaults without losing cached PR pages or repository list", () => {
  const storage = new MemoryStorage();
  const original = loadedSession();
  const { prFilters, ...legacyView } = original.view;
  storage.setItem("pr-list.tab-session.v1:test", JSON.stringify({ ...original, version: 3, view: legacyView }));
  assert.deepEqual(readSession("test", storage), original);
});

test("invalid saved filter values are reported instead of broadening the PR query", () => {
  const storage = new MemoryStorage();
  for (const prFilters of [undefined, null, {}, { ...DEFAULT_PR_FILTERS, reviewerContainsMeOnly: "false" }]) {
    const session = loadedSession();
    session.view.prFilters = prFilters;
    writeSession("test", session, storage);
    assert.throws(() => readSession("test", storage), /incompatible/);
  }
});
