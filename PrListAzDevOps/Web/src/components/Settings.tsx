import type { TabView } from "../services/tabSession";
import { getRepositoryKey } from "../services/repositoryList";
import { Filters } from "./Filters";

interface SettingsProps {
  view: TabView;
  onOrganizationChange: (organization: string) => void;
  onProjectChange: (project: string) => void;
  onSearchChange: (search: string) => void;
  onAddRepository: (repositoryId: string) => void;
  onRemoveRepository: (key: string) => void;
  onRetryProjects: () => void;
  onRetryRepositories: () => void;
}

export function Settings({
  view, onOrganizationChange, onProjectChange, onSearchChange, onAddRepository,
  onRemoveRepository, onRetryProjects, onRetryRepositories,
}: SettingsProps) {
  const addedRepositoryIds = view.repositories.filter(repository => view.repositoryList.some(
    entry => getRepositoryKey(entry) === getRepositoryKey({ organization: view.organization, repositoryId: repository.id }),
  )).map(repository => repository.id);

  return (
    <section aria-labelledby="settings-title">
      <h2 id="settings-title">Settings</h2>
      <p>Add repositories to the list below. The Pull Requests page shows only repositories in this list.</p>
      <Filters
        organization={view.organization}
        onOrganizationChange={onOrganizationChange}
        projects={view.projects}
        selectedProject={view.selectedProject}
        onProjectChange={onProjectChange}
        repositories={view.repositories}
        addedRepositoryIds={addedRepositoryIds}
        repositorySearch={view.repositorySearch}
        onAddRepository={onAddRepository}
        onRepositorySearchChange={onSearchChange}
        isLoadingProjects={!!view.organization.trim() && view.projectsStatus === "idle"}
        isLoadingRepositories={!!view.selectedProject && view.repositoriesStatus === "idle"}
      />
      {view.projectsError && <div className="alert alert-danger" role="alert">
        {view.projectsError} <button className="btn btn-secondary" onClick={onRetryProjects}>Retry projects</button>
      </div>}
      {view.repositoriesError && <div className="alert alert-danger" role="alert">
        {view.repositoriesError} <button className="btn btn-secondary" onClick={onRetryRepositories}>Retry repositories</button>
      </div>}
      <section className="saved-repositories" aria-labelledby="saved-repositories-title">
        <h3 id="saved-repositories-title">Selected repositories ({view.repositoryList.length})</h3>
        <p>Saved automatically for this tab session. You can add repositories from different organizations and projects.</p>
        {view.repositoryList.length === 0 ? <p>No repositories added yet. Use the picker above to add one.</p> : (
          <ul className="saved-repository-list">
            {view.repositoryList.map(entry => (
              <li className="saved-repository" key={getRepositoryKey(entry)}>
                <div>
                  <strong>{entry.repositoryName}</strong>
                  <div className="saved-repository-scope">{entry.organization} / {entry.projectName}</div>
                </div>
                <button
                  className="btn btn-secondary btn-sm"
                  type="button"
                  aria-label={`Remove ${entry.repositoryName} from ${entry.organization} / ${entry.projectName}`}
                  onClick={() => onRemoveRepository(getRepositoryKey(entry))}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}
