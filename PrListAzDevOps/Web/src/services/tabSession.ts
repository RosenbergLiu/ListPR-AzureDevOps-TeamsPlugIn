import type { GitPullRequest, GitRepository, ListedPullRequest, PullRequestFilters, PullRequestOffsets, SavedIdentity, SelectedRepository, TeamProjectReference, UserProfile } from "../types/azureDevOps";
import { getRepositoryKey } from "./repositoryList.ts";
import { DEFAULT_PR_FILTERS, isPullRequestFilters } from "./prFilters.ts";

export type LoadStatus = "idle" | "ready" | "error";
export type TabPage = "prs" | "settings";

export interface LoginState {
  isOpen: boolean;
  authTab: "entra" | "pat";
  clientId: string;
  tenantId: string;
}

export interface TabView {
  theme: string;
  page: TabPage;
  organization: string;
  projects: TeamProjectReference[];
  selectedProject: string;
  repositories: GitRepository[];
  repositoryList: SelectedRepository[];
  repositorySearch: string;
  repositoryOffsets: PullRequestOffsets;
  prFilters: PullRequestFilters;
  pullRequests: ListedPullRequest[];
  hasMore: boolean;
  projectsStatus: LoadStatus;
  repositoriesStatus: LoadStatus;
  prsStatus: LoadStatus;
  projectsError: string | null;
  repositoriesError: string | null;
  prError: string | null;
  scrollY: number;
  settingsScrollY: number;
  login: LoginState;
}

export interface TabSession {
  version: 4;
  identity: SavedIdentity | null;
  view: TabView;
}

type SessionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
// Keep the storage key so existing single-repository sessions can be migrated in place.
const KEY_PREFIX = "pr-list.tab-session.v1:";

export function createSession(): TabSession {
  return {
    version: 4,
    identity: null,
    view: {
      theme: "default", page: "prs", organization: "", projects: [], selectedProject: "",
      repositories: [], repositoryList: [], repositorySearch: "", repositoryOffsets: {},
      prFilters: { ...DEFAULT_PR_FILTERS },
      pullRequests: [], hasMore: false,
      projectsStatus: "idle", repositoriesStatus: "idle", prsStatus: "ready",
      projectsError: null, repositoriesError: null, prError: null, scrollY: 0, settingsScrollY: 0,
      login: { isOpen: false, authTab: "entra", clientId: "", tenantId: "" },
    },
  };
}

export function savedIdentity(user: UserProfile): SavedIdentity {
  if (user.authMethod === "pat") {
    return { authMethod: "pat", name: user.name, username: user.username, token: user.token };
  }
  const { name, username, authMethod, clientId, tenantId, homeAccountId } = user;
  return { name, username, authMethod, clientId, tenantId, homeAccountId };
}

export function sameIdentity(left: SavedIdentity | null, right: SavedIdentity): boolean {
  if (!left || left.authMethod !== right.authMethod) return false;
  if (left.authMethod === "pat" && right.authMethod === "pat") return left.token === right.token;
  return left.authMethod === "entra" && right.authMethod === "entra"
    && left.homeAccountId === right.homeAccountId && left.clientId === right.clientId
    && left.tenantId === right.tenantId;
}

export function resetPullRequests(view: TabView): TabView {
  return {
    ...view, pullRequests: [], repositoryOffsets: {}, hasMore: false,
    prsStatus: view.repositoryList.length ? "idle" : "ready", prError: null, scrollY: 0,
  };
}

export function changePrFilters(view: TabView, patch: Partial<PullRequestFilters>): TabView {
  const prFilters = { ...view.prFilters, ...patch };
  if (prFilters.showDrafts === view.prFilters.showDrafts
    && prFilters.createdByMeOnly === view.prFilters.createdByMeOnly
    && prFilters.reviewerContainsMeOnly === view.prFilters.reviewerContainsMeOnly) return view;
  return resetPullRequests({ ...view, prFilters });
}

export function repositoryFromPicker(view: TabView, repositoryId: string): SelectedRepository {
  const repository = view.repositories.find(item => item.id === repositoryId);
  const project = repository?.project
    ?? view.projects.find(item => item.id === view.selectedProject || item.name === view.selectedProject);
  if (!repository || !project || !view.organization.trim() || !view.selectedProject) {
    throw new Error("Select an available project and repository before adding it to the list.");
  }
  return {
    organization: view.organization.trim(), projectId: project.id, projectName: project.name,
    repositoryId: repository.id, repositoryName: repository.name,
  };
}

export function addRepository(view: TabView, entry: SelectedRepository): TabView {
  if (view.repositoryList.some(item => getRepositoryKey(item) === getRepositoryKey(entry))) return view;
  return resetPullRequests({ ...view, repositoryList: [...view.repositoryList, entry] });
}

export function removeRepository(view: TabView, key: string): TabView {
  const repositoryList = view.repositoryList.filter(item => getRepositoryKey(item) !== key);
  return repositoryList.length === view.repositoryList.length ? view : resetPullRequests({ ...view, repositoryList });
}

export function selectProject(view: TabView, selectedProject: string): TabView {
  return {
    ...view, selectedProject, repositorySearch: "", repositories: [],
    repositoriesStatus: "idle", repositoriesError: null,
  };
}

export function selectOrganization(view: TabView, organization: string): TabView {
  return selectProject({
    ...view, organization, projects: [], projectsStatus: "idle", projectsError: null,
  }, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProject(value: unknown): value is TeamProjectReference {
  return isRecord(value) && typeof value.id === "string" && typeof value.name === "string";
}

function isRepository(value: unknown): value is GitRepository {
  return isProject(value) && isRecord(value) && typeof value.url === "string"
    && (value.project === undefined || isProject(value.project));
}

function isPerson(value: unknown): boolean {
  return isRecord(value) && typeof value.id === "string" && typeof value.displayName === "string";
}

function isPullRequest(value: unknown): value is GitPullRequest {
  return isRecord(value) && Number.isInteger(value.pullRequestId)
    && value.status === "active" && typeof value.title === "string"
    && typeof value.creationDate === "string" && typeof value.sourceRefName === "string"
    && typeof value.targetRefName === "string" && typeof value.url === "string"
    && (value.isDraft === undefined || typeof value.isDraft === "boolean")
    && isPerson(value.createdBy) && isRepository(value.repository)
    && (value.reviewers === undefined || (Array.isArray(value.reviewers)
      && value.reviewers.every(reviewer => isPerson(reviewer) && isRecord(reviewer) && typeof reviewer.vote === "number")));
}

function isSavedIdentity(value: unknown): value is SavedIdentity {
  if (!isRecord(value) || typeof value.name !== "string" || typeof value.username !== "string") return false;
  if (value.authMethod === "pat") return typeof value.token === "string" && value.token.length > 0;
  return value.authMethod === "entra" && typeof value.clientId === "string"
    && typeof value.homeAccountId === "string"
    && (value.tenantId === undefined || typeof value.tenantId === "string")
    && value.token === undefined;
}

function isSelectedRepository(value: unknown): value is SelectedRepository {
  return isRecord(value)
    && ["organization", "projectId", "projectName", "repositoryId", "repositoryName"]
      .every(key => typeof value[key] === "string" && value[key].trim().length > 0);
}

function isSession(value: unknown): value is TabSession {
  if (!isRecord(value) || value.version !== 4 || !isRecord(value.view)) return false;
  if (value.identity !== null && !isSavedIdentity(value.identity)) return false;
  const view = value.view;
  if (!Array.isArray(view.repositoryList) || !view.repositoryList.every(isSelectedRepository)) return false;
  const keys = new Set(view.repositoryList.map(getRepositoryKey));
  return ["theme", "organization", "selectedProject", "repositorySearch"].every(key => typeof view[key] === "string")
    && ["prs", "settings"].includes(String(view.page))
    && isPullRequestFilters(view.prFilters)
    && keys.size === view.repositoryList.length
    && isRecord(view.repositoryOffsets) && Object.keys(view.repositoryOffsets).every(key => keys.has(key))
    && Object.values(view.repositoryOffsets).every(offset => typeof offset === "number" && Number.isSafeInteger(offset) && offset >= 0)
    && ["projectsStatus", "repositoriesStatus", "prsStatus"].every(key => ["idle", "ready", "error"].includes(String(view[key])))
    && ["projectsError", "repositoriesError", "prError"].every(key => view[key] === null || typeof view[key] === "string")
    && Array.isArray(view.projects) && view.projects.every(isProject)
    && Array.isArray(view.repositories) && view.repositories.every(isRepository)
    && Array.isArray(view.pullRequests) && view.pullRequests.every(pr => isPullRequest(pr) && isRecord(pr)
      && typeof pr.organization === "string" && keys.has(getRepositoryKey({ organization: pr.organization, repositoryId: pr.repository.id })))
    && typeof view.hasMore === "boolean" && typeof view.scrollY === "number" && Number.isFinite(view.scrollY) && view.scrollY >= 0
    && typeof view.settingsScrollY === "number" && Number.isFinite(view.settingsScrollY) && view.settingsScrollY >= 0
    && isRecord(view.login) && typeof view.login.isOpen === "boolean"
    && ["entra", "pat"].includes(String(view.login.authTab))
    && typeof view.login.clientId === "string" && typeof view.login.tenantId === "string";
}

export function readSession(scope: string, storage?: SessionStorage): TabSession {
  const raw = (storage ?? window.sessionStorage).getItem(KEY_PREFIX + scope);
  if (raw === null) return createSession();
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    throw new Error("The saved tab session is unreadable. A new session has been started.");
  }
  if (isRecord(value) && value.version === 1 && isRecord(value.view)
    && typeof value.view.selectedRepository === "string" && Array.isArray(value.view.pullRequests)) {
    const { selectedRepository, ...view } = value.view;
    value = {
      ...value, version: 2,
      view: {
        ...view, selectedRepositories: selectedRepository ? [selectedRepository] : [], repositorySearch: "",
        repositoryOffsets: { [selectedRepository || "*"]: value.view.pullRequests.length },
      },
    };
  }
  if (isRecord(value) && value.version === 2 && isRecord(value.view)) {
    const { selectedRepositories, ...view } = value.view;
    if (!Array.isArray(selectedRepositories) || !selectedRepositories.every(id => typeof id === "string" && id.trim() && id !== "*")
      || typeof view.organization !== "string" || typeof view.selectedProject !== "string"
      || !Array.isArray(view.repositories) || !view.repositories.every(isRepository)
      || !Array.isArray(view.projects) || !view.projects.every(isProject)
      || !Array.isArray(view.pullRequests) || !view.pullRequests.every(isPullRequest)
      || !isRecord(view.repositoryOffsets)) {
      throw new Error("The saved repository selections are incompatible. A new session has been started.");
    }
    const organization = view.organization;
    const selectedProject = view.selectedProject;
    const repositories = view.repositories;
    const pullRequests = view.pullRequests;
    const offsets = view.repositoryOffsets;
    const project = view.projects.find(item => item.id === view.selectedProject || item.name === view.selectedProject);
    const repositoryList = selectedRepositories.map(repositoryId => {
      const repository = repositories.find(item => item.id === repositoryId)
        ?? pullRequests.find(pr => pr.repository.id === repositoryId)?.repository;
      return {
        organization, repositoryId, repositoryName: repository?.name ?? repositoryId,
        projectId: repository?.project?.id ?? project?.id ?? selectedProject,
        projectName: repository?.project?.name ?? project?.name ?? selectedProject,
      };
    });
    value = {
      ...value, version: 3,
      view: {
        ...view, page: "prs", settingsScrollY: 0, repositoryList,
        repositoryOffsets: Object.fromEntries(repositoryList.map(entry => [
          getRepositoryKey(entry), offsets[entry.repositoryId] ?? 0,
        ])),
        pullRequests: repositoryList.length ? view.pullRequests.map(pr => ({ ...pr, organization })) : [],
        hasMore: repositoryList.length ? view.hasMore : false,
        prsStatus: repositoryList.length ? view.prsStatus : "ready",
        prError: repositoryList.length ? view.prError : null,
        scrollY: repositoryList.length ? view.scrollY : 0,
      },
    };
  }
  if (isRecord(value) && value.version === 3 && isRecord(value.view)) {
    value = { ...value, version: 4, view: { ...value.view, prFilters: { ...DEFAULT_PR_FILTERS } } };
  }
  if (!isSession(value)) throw new Error("The saved tab session is incompatible. A new session has been started.");
  return value;
}

export function writeSession(scope: string, session: TabSession, storage?: SessionStorage): void {
  (storage ?? window.sessionStorage).setItem(KEY_PREFIX + scope, JSON.stringify(session));
}

export function clearSession(scope: string, storage?: SessionStorage): void {
  (storage ?? window.sessionStorage).removeItem(KEY_PREFIX + scope);
}
