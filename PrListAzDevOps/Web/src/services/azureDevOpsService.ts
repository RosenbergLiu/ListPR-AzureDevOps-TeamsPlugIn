import type { GitPullRequest, GitRepository, TeamProjectReference, AzureDevOpsListResponse, UserProfile } from "../types/azureDevOps";
import { getAccessToken } from "./authService.ts";

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
  organization: string,
  project: string,
  user: UserProfile,
  repositoryId?: string,
  top = 20,
  skip = 0
): Promise<{ pullRequests: GitPullRequest[]; hasMore: boolean }> {
  const cleanOrg = encodeURIComponent(organization.trim());
  const cleanProject = encodeURIComponent(project.trim());
  
  let baseUrl: string;
  if (repositoryId && repositoryId.trim()) {
    const cleanRepo = encodeURIComponent(repositoryId.trim());
    baseUrl = `https://dev.azure.com/${cleanOrg}/${cleanProject}/_apis/git/repositories/${cleanRepo}/pullrequests`;
  } else {
    baseUrl = `https://dev.azure.com/${cleanOrg}/${cleanProject}/_apis/git/pullrequests`;
  }

  const params = new URLSearchParams({
    "searchCriteria.status": "active",
    "$top": top.toString(),
    "$skip": skip.toString(),
    "api-version": "7.1",
  });

  const url = `${baseUrl}?${params.toString()}`;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: await getAuthHeader(user),
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to load pull requests (${response.status}). Check your access; sign in again if your credentials have expired.`);
  }

  const data: AzureDevOpsListResponse<GitPullRequest> = await response.json();
  const pullRequests = data.value || [];
  const hasMore = pullRequests.length === top;

  return { pullRequests, hasMore };
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
