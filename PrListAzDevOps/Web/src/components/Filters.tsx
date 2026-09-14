import React from "react";
import { TeamProjectReference, GitRepository } from "../types/azureDevOps";

interface FiltersProps {
  organization: string;
  onOrganizationChange: (org: string) => void;
  projects: TeamProjectReference[];
  selectedProject: string;
  onProjectChange: (project: string) => void;
  repositories: GitRepository[];
  selectedRepository: string;
  onRepositoryChange: (repoId: string) => void;
  onRefresh: () => void;
  isLoadingProjects: boolean;
  isLoadingRepositories: boolean;
  isLoadingPrs: boolean;
}

export const Filters: React.FC<FiltersProps> = ({
  organization,
  onOrganizationChange,
  projects,
  selectedProject,
  onProjectChange,
  repositories,
  selectedRepository,
  onRepositoryChange,
  onRefresh,
  isLoadingProjects,
  isLoadingRepositories,
  isLoadingPrs,
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
          <label htmlFor="repoSelect" className="filter-label">
            Repository (Optional) {isLoadingRepositories && <span className="loading-badge">Loading...</span>}
          </label>
          <select
            id="repoSelect"
            className="form-control"
            value={selectedRepository}
            onChange={(e) => onRepositoryChange(e.target.value)}
            disabled={!selectedProject || isLoadingRepositories}
          >
            <option value="">All Repositories</option>
            {repositories.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-actions">
          <button
            type="button"
            className="btn btn-secondary btn-refresh"
            onClick={onRefresh}
            disabled={!organization.trim() || !selectedProject || isLoadingPrs}
            title="Refresh Pull Requests"
          >
            <svg
              className={`refresh-icon ${isLoadingPrs ? "spinning" : ""}`}
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M23 4v6h-6" />
              <path d="M1 20v-6h6" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
            </svg>
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
};
