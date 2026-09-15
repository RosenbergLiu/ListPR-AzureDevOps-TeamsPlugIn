import React from "react";
import { TeamProjectReference, GitRepository } from "../types/azureDevOps";
import { RepositorySelector } from "./RepositorySelector";

interface FiltersProps {
  organization: string;
  onOrganizationChange: (org: string) => void;
  projects: TeamProjectReference[];
  selectedProject: string;
  onProjectChange: (project: string) => void;
  repositories: GitRepository[];
  addedRepositoryIds: string[];
  repositorySearch: string;
  onAddRepository: (repoId: string) => void;
  onRepositorySearchChange: (search: string) => void;
  isLoadingProjects: boolean;
  isLoadingRepositories: boolean;
}

export const Filters: React.FC<FiltersProps> = ({
  organization,
  onOrganizationChange,
  projects,
  selectedProject,
  onProjectChange,
  repositories,
  addedRepositoryIds,
  repositorySearch,
  onAddRepository,
  onRepositorySearchChange,
  isLoadingProjects,
  isLoadingRepositories,
}) => {
  return (
    <div className="filters-card">
      <div className="filters-grid">
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
        </div>

        <div className="form-group">
          <div className="filter-label">
            Repositories {isLoadingRepositories && <span className="loading-badge">Loading...</span>}
          </div>
          <RepositorySelector
            repositories={repositories}
            addedRepositoryIds={addedRepositoryIds}
            search={repositorySearch}
            onAddRepository={onAddRepository}
            onSearchChange={onRepositorySearchChange}
            disabled={!selectedProject || isLoadingRepositories}
          />
        </div>

      </div>
    </div>
  );
};
