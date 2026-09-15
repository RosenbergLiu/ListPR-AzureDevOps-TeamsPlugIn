import type { SelectedRepository } from "../types/azureDevOps";

export function getRepositoryKey(repository: Pick<SelectedRepository, "organization" | "repositoryId">): string {
  return JSON.stringify([repository.organization.trim().toLowerCase(), repository.repositoryId.toLowerCase()]);
}
