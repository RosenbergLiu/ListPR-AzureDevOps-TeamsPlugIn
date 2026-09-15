import type { GitRepository } from "../types/azureDevOps";

interface RepositorySelectorProps {
  repositories: GitRepository[];
  addedRepositoryIds: string[];
  search: string;
  onAddRepository: (repositoryId: string) => void;
  onSearchChange: (search: string) => void;
  disabled: boolean;
}

export function RepositorySelector({
  repositories, addedRepositoryIds, search, onAddRepository, onSearchChange, disabled,
}: RepositorySelectorProps) {
  const query = search.trim().toLocaleLowerCase();
  const matches = repositories.filter(repository => repository.name.toLocaleLowerCase().includes(query));
  const added = new Set(addedRepositoryIds);

  return (
    <details
      className="repository-picker"
      onKeyDown={event => {
        if (event.key === "Escape") {
          event.currentTarget.open = false;
          event.currentTarget.querySelector("summary")?.focus();
        }
      }}
    >
      <summary
        className="form-control"
        aria-label="Add repositories"
        aria-disabled={disabled}
        onClick={event => { if (disabled) event.preventDefault(); }}
      >
        Add repositories
      </summary>
      <div className="repository-picker-panel">
        <label htmlFor="repositorySearch" className="filter-label">Search repositories</label>
        <input
          id="repositorySearch"
          type="search"
          className="form-control"
          placeholder="Search by name"
          value={search}
          onChange={event => onSearchChange(event.target.value)}
          disabled={disabled}
        />
        <p className="repository-picker-hint">Add repositories to your saved list below. Search does not change the list.</p>
        <p role="status">{added.size} in the list for this project</p>
        <fieldset className="repository-options" disabled={disabled}>
          <legend className="filter-label">Choose repositories</legend>
          {matches.map(repository => (
            <div className="repository-option" key={repository.id}>
              <span>{repository.name}</span>
              <button
                className="btn btn-secondary btn-sm"
                type="button"
                disabled={added.has(repository.id)}
                aria-label={`${added.has(repository.id) ? "Added" : "Add"} ${repository.name}`}
                onClick={() => onAddRepository(repository.id)}
              >
                {added.has(repository.id) ? "Added" : "Add"}
              </button>
            </div>
          ))}
          {!matches.length && <p role="status">{repositories.length ? "No repositories match your search." : "No repositories available."}</p>}
        </fieldset>
      </div>
    </details>
  );
}
