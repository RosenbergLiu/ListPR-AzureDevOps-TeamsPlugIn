import type { GitRepository } from "../types/azureDevOps";

export function filterRepositories(repositories: GitRepository[], search: string): GitRepository[] {
  const query = search.trim().toLowerCase();
  return repositories.filter(repository => repository.name.toLowerCase().includes(query));
}
