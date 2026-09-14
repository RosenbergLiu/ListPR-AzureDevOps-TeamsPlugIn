import type { GitPullRequest, GitRepository, SavedIdentity, TeamProjectReference, UserProfile } from "../types/azureDevOps";

export type LoadStatus = "idle" | "ready" | "error";

export interface LoginState {
  isOpen: boolean;
  authTab: "entra" | "pat";
  clientId: string;
  tenantId: string;
}

export interface TabView {
  theme: string;
  organization: string;
  projects: TeamProjectReference[];
  selectedProject: string;
  repositories: GitRepository[];
  selectedRepository: string;
  pullRequests: GitPullRequest[];
  hasMore: boolean;
  projectsStatus: LoadStatus;
  repositoriesStatus: LoadStatus;
  prsStatus: LoadStatus;
  projectsError: string | null;
  repositoriesError: string | null;
  prError: string | null;
  scrollY: number;
  login: LoginState;
}

export interface TabSession {
  version: 1;
  identity: SavedIdentity | null;
  view: TabView;
}

type SessionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const KEY_PREFIX = "pr-list.tab-session.v1:";

export function createSession(): TabSession {
  return {
    version: 1,
    identity: null,
    view: {
      theme: "default", organization: "", projects: [], selectedProject: "",
      repositories: [], selectedRepository: "", pullRequests: [], hasMore: false,
      projectsStatus: "idle", repositoriesStatus: "idle", prsStatus: "idle",
      projectsError: null, repositoriesError: null, prError: null, scrollY: 0,
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
  return { ...view, pullRequests: [], hasMore: false, prsStatus: "idle", prError: null, scrollY: 0 };
}

export function selectProject(view: TabView, selectedProject: string): TabView {
  return resetPullRequests({
    ...view, selectedProject, selectedRepository: "", repositories: [],
    repositoriesStatus: "idle", repositoriesError: null,
  });
}

export function selectOrganization(view: TabView, organization: string): TabView {
  return selectProject({
    ...view, organization, projects: [], projectsStatus: "idle", projectsError: null,
  }, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

function isSession(value: unknown): value is TabSession {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.view)) return false;
  if (value.identity !== null && !isSavedIdentity(value.identity)) return false;
  const view = value.view;
  return ["theme", "organization", "selectedProject", "selectedRepository"].every(key => typeof view[key] === "string")
    && ["projectsStatus", "repositoriesStatus", "prsStatus"].every(key => ["idle", "ready", "error"].includes(String(view[key])))
    && ["projectsError", "repositoriesError", "prError"].every(key => view[key] === null || typeof view[key] === "string")
    && Array.isArray(view.projects) && view.projects.every(isProject)
    && Array.isArray(view.repositories) && view.repositories.every(isRepository)
    && Array.isArray(view.pullRequests) && view.pullRequests.every(isPullRequest)
    && typeof view.hasMore === "boolean" && typeof view.scrollY === "number" && Number.isFinite(view.scrollY) && view.scrollY >= 0
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
  if (!isSession(value)) throw new Error("The saved tab session is incompatible. A new session has been started.");
  return value;
}

export function writeSession(scope: string, session: TabSession, storage?: SessionStorage): void {
  (storage ?? window.sessionStorage).setItem(KEY_PREFIX + scope, JSON.stringify(session));
}

export function clearSession(scope: string, storage?: SessionStorage): void {
  (storage ?? window.sessionStorage).removeItem(KEY_PREFIX + scope);
}
