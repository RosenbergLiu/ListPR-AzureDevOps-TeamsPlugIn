export interface IdentityRef {
  id: string;
  displayName: string;
  uniqueName?: string;
  imageUrl?: string;
  url?: string;
  _links?: {
    avatar?: {
      href: string;
    };
  };
}

export interface PullRequestReviewer extends IdentityRef {
  reviewerUrl?: string;
  vote: number; // 10 = approved, 5 = approved with suggestions, 0 = no vote, -5 = waiting for author, -10 = rejected
  hasDeclined?: boolean;
  isRequired?: boolean;
}

export interface GitRepository {
  id: string;
  name: string;
  url: string;
  project?: TeamProjectReference;
  webUrl?: string;
}

export interface TeamProjectReference {
  id: string;
  name: string;
  description?: string;
  url?: string;
  state?: string;
  visibility?: string;
}

export interface GitPullRequest {
  pullRequestId: number;
  codeReviewId?: number;
  status: 'active' | 'abandoned' | 'completed' | 'all';
  createdBy: IdentityRef;
  creationDate: string;
  title: string;
  description?: string;
  sourceRefName: string;
  targetRefName: string;
  mergeStatus?: string;
  isDraft?: boolean;
  repository: GitRepository;
  reviewers?: PullRequestReviewer[];
  url: string;
  _links?: {
    web?: {
      href: string;
    };
  };
}

export interface AzureDevOpsListResponse<T> {
  count: number;
  value: T[];
}

export type PullRequestOffsets = Record<string, number>;

export interface PullRequestFilters {
  showDrafts: boolean;
  createdByMeOnly: boolean;
  reviewerContainsMeOnly: boolean;
}

export interface SelectedRepository {
  organization: string;
  projectId: string;
  projectName: string;
  repositoryId: string;
  repositoryName: string;
}

export interface ListedPullRequest extends GitPullRequest {
  organization: string;
}

export interface AuthConfig {
  clientId?: string;
  tenantId?: string;
}

interface Profile {
  name: string;
  username: string;
}

export interface EntraIdentity extends Profile {
  authMethod: "entra";
  clientId: string;
  tenantId?: string;
  homeAccountId: string;
}

export interface PatIdentity extends Profile {
  authMethod: "pat";
  token: string;
}

export type SavedIdentity = EntraIdentity | PatIdentity;
export type UserProfile = (EntraIdentity & { token: string }) | PatIdentity;
