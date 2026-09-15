import type { GitPullRequest, GitRepository, TeamProjectReference, AzureDevOpsListResponse, ListedPullRequest, PullRequestFilters, PullRequestOffsets, SelectedRepository, UserProfile } from "../types/azureDevOps";
import { getAccessToken } from "./authService.ts";
import { getRepositoryKey } from "./repositoryList.ts";
import { DEFAULT_PR_FILTERS, isPullRequestFilters } from "./prFilters.ts";

async function getAuthHeader(user: UserProfile): Promise<string> {
  const token = await getAccessToken(user);
  if (user.authMethod === "pat") {
    // Azure DevOps PAT uses Basic authentication with base64(:PAT) or Bearer
    const base64Pat = btoa(`:${token}`);
    return `Basic ${base64Pat}`;
  }
  return `Bearer ${token}`;
}

export async function fetchProjects(
  organization: string,
  user: UserProfile
): Promise<TeamProjectReference[]> {
  const cleanOrg = encodeURIComponent(organization.trim());
  const url = `https://dev.azure.com/${cleanOrg}/_apis/projects?api-version=7.1`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: await getAuthHeader(user),
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to load projects (${response.status}). Check your organization and access; sign in again if your credentials have expired.`);
  }

  const data: AzureDevOpsListResponse<TeamProjectReference> = await response.json();
  return data.value || [];
}

export async function fetchRepositories(
  organization: string,
  project: string,
  user: UserProfile
): Promise<GitRepository[]> {
  const cleanOrg = encodeURIComponent(organization.trim());
  const cleanProject = encodeURIComponent(project.trim());
  const url = `https://dev.azure.com/${cleanOrg}/${cleanProject}/_apis/git/repositories?api-version=7.1`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: await getAuthHeader(user),
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to load repositories (${response.status}). Check your project access; sign in again if your credentials have expired.`);
  }

  const data: AzureDevOpsListResponse<GitRepository> = await response.json();
  return data.value || [];
}

export async function fetchActivePullRequests(
  repositories: SelectedRepository[],
  user: UserProfile,
  top = 20,
  offsets: PullRequestOffsets = {},
  signal?: AbortSignal,
  filters: PullRequestFilters = DEFAULT_PR_FILTERS,
): Promise<{ pullRequests: ListedPullRequest[]; hasMore: boolean; nextOffsets: PullRequestOffsets }> {
  if (!isPullRequestFilters(filters)) throw new Error("The pull request filters are invalid.");
  if (!Number.isSafeInteger(top) || top < 1 || top > 100) {
    throw new Error("The PR page size must be between 1 and 100.");
  }
  if (!Array.isArray(repositories) || repositories.some(repository =>
    !repository || typeof repository !== "object"
    || [repository.organization, repository.projectId, repository.projectName, repository.repositoryId, repository.repositoryName]
      .some(value => typeof value !== "string" || !value.trim())
    || [repository.organization, repository.projectId, repository.repositoryId]
      .some(value => ["*", ".", ".."].includes(value.trim()))
    || repository.projectId !== repository.projectId.trim()
    || repository.repositoryId !== repository.repositoryId.trim())) {
    throw new Error("The repository selection is invalid.");
  }
  const targets = new Map<string, SelectedRepository>();
  for (const repository of repositories) {
    const key = getRepositoryKey(repository);
    const existing = targets.get(key);
    if (existing && existing.projectId.toLowerCase() !== repository.projectId.toLowerCase()) {
      throw new Error("The repository selection contains conflicting project targets.");
    }
    if (!existing) targets.set(key, repository);
  }
  if (!offsets || typeof offsets !== "object" || Array.isArray(offsets)
    || Object.entries(offsets).some(([key, offset]) =>
      !targets.has(key) || !Number.isSafeInteger(offset) || offset < 0 || offset > Number.MAX_SAFE_INTEGER - top)) {
    throw new Error("The PR page position is invalid.");
  }
  signal?.throwIfAborted();
  if (!targets.size) return { pullRequests: [], hasMore: false, nextOffsets: {} };
  const authorization = await getAuthHeader(user);
  const identities = new Map<string, Promise<string>>();
  async function fetchCurrentUserId(organization: string): Promise<string> {
    signal?.throwIfAborted();
    const response = await fetch(`https://dev.azure.com/${encodeURIComponent(organization)}/_apis/connectionData?api-version=7.1-preview.1`, {
      method: "GET", signal,
      headers: { Authorization: authorization, "Content-Type": "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Unable to identify your Azure DevOps user (${response.status}). The "me" filters could not be applied. Check your access or sign in again.`);
    }
    const data: { authenticatedUser?: { id?: unknown } } | null = await response.json();
    const id = data?.authenticatedUser?.id;
    if (typeof id !== "string" || !id.trim() || id === "00000000-0000-0000-0000-000000000000") {
      throw new Error('Azure DevOps did not return a user identity. The "me" filters could not be applied.');
    }
    return id;
  }
  function currentUserId(organization: string): Promise<string> {
    const key = organization.toLowerCase();
    const existing = identities.get(key);
    if (existing) return existing;
    const request = fetchCurrentUserId(organization);
    identities.set(key, request);
    return request;
  }
  async function fetchPage([key, repository]: [string, SelectedRepository]) {
    signal?.throwIfAborted();
    const organization = repository.organization.trim();
    const cleanOrg = encodeURIComponent(organization);
    const cleanProject = encodeURIComponent(repository.projectId);
    const cleanRepository = encodeURIComponent(repository.repositoryId);
    const params = new URLSearchParams({
      "searchCriteria.status": "active",
      "$top": (top + 1).toString(),
      "$skip": (offsets[key] ?? 0).toString(),
      "api-version": "7.1",
    });
    if (filters.createdByMeOnly || filters.reviewerContainsMeOnly) {
      const id = await currentUserId(organization);
      if (filters.createdByMeOnly) params.set("searchCriteria.creatorId", id);
      if (filters.reviewerContainsMeOnly) params.set("searchCriteria.reviewerId", id);
    }
    const values: { pr: ListedPullRequest; offset: number }[] = [];
    let scannedOffset = offsets[key] ?? 0;
    let exhausted = false;
    // Draft filtering is local: scan through excluded rows and retain raw offsets for unshown matches.
    while (values.length < top + 1 && !exhausted) {
      signal?.throwIfAborted();
      if (scannedOffset > Number.MAX_SAFE_INTEGER - top - 1) throw new Error("The PR page position is invalid.");
      params.set("$skip", scannedOffset.toString());
      const response = await fetch(`https://dev.azure.com/${cleanOrg}/${cleanProject}/_apis/git/repositories/${cleanRepository}/pullrequests?${params}`, {
        method: "GET", signal,
        headers: { Authorization: authorization, "Content-Type": "application/json" },
      });
      if (!response.ok) {
        throw new Error(`Failed to load pull requests (${response.status}). Check your access; sign in again if your credentials have expired.`);
      }
      const data: AzureDevOpsListResponse<GitPullRequest> = await response.json();
      if (!data || !Array.isArray(data.value)) throw new Error("Azure DevOps returned an invalid PR page.");
      for (const pr of data.value) {
        const offset = scannedOffset++;
        if (filters.showDrafts || !pr.isDraft) values.push({ pr: { ...pr, organization }, offset });
        if (values.length === top + 1) break;
      }
      exhausted = data.value.length < top + 1;
    }
    return { key, values, scannedOffset, consumed: 0 };
  }
  const pages: Awaited<ReturnType<typeof fetchPage>>[] = [];
  const entries = [...targets.entries()];
  for (let index = 0; index < entries.length; index += 4) {
    pages.push(...await Promise.all(entries.slice(index, index + 4).map(fetchPage)));
  }
  signal?.throwIfAborted();

  // Consume prefixes only: unshown lookahead rows are fetched again using each repo's saved offset.
  const pullRequests: ListedPullRequest[] = [];
  while (pullRequests.length < top) {
    const available = pages.filter(page => page.consumed < page.values.length);
    if (!available.length) break;
    available.sort((left, right) => {
      const a = left.values[left.consumed].pr;
      const b = right.values[right.consumed].pr;
      return Date.parse(b.creationDate) - Date.parse(a.creationDate) || b.pullRequestId - a.pullRequestId;
    });
    const next = available[0];
    pullRequests.push(next.values[next.consumed++].pr);
  }
  return {
    pullRequests,
    hasMore: pages.some(page => page.consumed < page.values.length),
    nextOffsets: Object.fromEntries(pages.map(page => [page.key, page.values[page.consumed]?.offset ?? page.scannedOffset])),
  };
}

export function formatBranch(refName: string): string {
  if (!refName) return "";
  return refName.replace(/^refs\/heads\//, "");
}

export function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "Just now";
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 30) return `${diffInDays}d ago`;
  
  return date.toLocaleDateString();
}
