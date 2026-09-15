import React from "react";
import { TeamProjectReference, GitRepository } from "../types/azureDevOps";
import { filterRepositories } from "../services/repositorySearch";

interface SettingsPageProps {
  organization: string;
  onOrganizationChange: (org: string) => void;
  projects: TeamProjectReference[];
  selectedProject: string;
  onProjectChange: (project: string) => void;
  repositories: GitRepository[];
  selectedRepository: string;
  onRepositoryChange: (repoId: string) => void;
  repositorySearch: string;
  onRepositorySearchChange: (search: string) => void;
  isLoadingProjects: boolean;
  isLoadingRepositories: boolean;
  projectsError: string | null;
  repositoriesError: string | null;
  onRetryProjects: () => void;
  onRetryRepositories: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  organization,
  onOrganizationChange,
  projects,
  selectedProject,
  onProjectChange,
  repositories,
  selectedRepository,
  onRepositoryChange,
  repositorySearch,
  onRepositorySearchChange,
  isLoadingProjects,
  isLoadingRepositories,
  projectsError,
  repositoriesError,
  onRetryProjects,
  onRetryRepositories,
}) => {
  const matchingRepositories = filterRepositories(repositories, repositorySearch);
  const currentRepository = repositories.find(repository => repository.id === selectedRepository);
  const selectedOutsideSearch = currentRepository
    && !matchingRepositories.some(repository => repository.id === selectedRepository);
  const repositoriesDisabled = !selectedProject || isLoadingRepositories;

  return (
    <section className="settings-page" aria-labelledby="settings-heading">
      <div className="page-heading">
        <div>
          <h2 id="settings-heading" className="page-title">Settings</h2>
          <p className="page-description">
            Choose the Azure DevOps organization, project, and repository for your pull requests.
            Changes apply automatically.
          </p>
        </div>
      </div>
      <div className="settings-card settings-fields">
        <div className="form-group">
          <label htmlFor="orgInput" className="filter-label">
            Azure DevOps Organization
          </label>
          <input
            id="orgInput"
            type="text"
            className="form-control"
            placeholder="e.g. your-org-name"
            value={organization}
            onChange={(e) => onOrganizationChange(e.target.value)}
          />
        </div>

        <div className="form-group">
          <label htmlFor="projectSelect" className="filter-label">
            Project {isLoadingProjects && <span className="loading-badge">Loading...</span>}
          </label>
          <select
            id="projectSelect"
            className="form-control"
            value={selectedProject}
            onChange={(e) => onProjectChange(e.target.value)}
            disabled={!organization.trim() || isLoadingProjects}
          >
            <option value="">-- Select a project --</option>
            {projects.map((p) => (
              <option key={p.id} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
          {projectsError && (
            <div className="alert alert-danger" role="alert">
              {projectsError} <button type="button" className="btn btn-secondary" onClick={onRetryProjects}>Retry projects</button>
            </div>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="repoSelect" className="filter-label">
            Repository (Optional) {isLoadingRepositories && <span className="loading-badge">Loading...</span>}
          </label>
          <div className="repository-search">
            <input
              id="repoSearch"
              type="search"
              className="form-control"
              aria-label="Search repositories"
              aria-controls="repoSelect"
              placeholder="Search repositories..."
              value={repositorySearch}
              onChange={(e) => onRepositorySearchChange(e.target.value)}
              disabled={repositoriesDisabled}
            />
            {repositorySearch && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onRepositorySearchChange("")}
                disabled={repositoriesDisabled}
              >
                Clear search
              </button>
            )}
          </div>
          <select
            id="repoSelect"
            className="form-control"
            value={selectedRepository}
            onChange={(e) => onRepositoryChange(e.target.value)}
            disabled={repositoriesDisabled}
          >
            <option value="">All Repositories</option>
            {selectedOutsideSearch && (
              <option value={currentRepository.id}>{currentRepository.name} (Selected)</option>
            )}
            {matchingRepositories.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          {repositoriesError ? (
            <div className="alert alert-danger" role="alert">
              {repositoriesError} <button type="button" className="btn btn-secondary" onClick={onRetryRepositories}>Retry repositories</button>
            </div>
          ) : !repositoriesDisabled && (
            <p className="form-help-text" role="status">
              {repositorySearch.trim()
                ? matchingRepositories.length === 0
                  ? "No repositories match your search."
                  : `Found ${matchingRepositories.length} matching ${matchingRepositories.length === 1 ? "repository" : "repositories"}.`
                : repositories.length === 0
                  ? "No repositories are available in this project."
                  : "Choose a repository or leave All Repositories selected."}
              {selectedOutsideSearch && " Your current selection is kept in the list."}
            </p>
          )}
        </div>
      </div>
    </section>
  );
};
