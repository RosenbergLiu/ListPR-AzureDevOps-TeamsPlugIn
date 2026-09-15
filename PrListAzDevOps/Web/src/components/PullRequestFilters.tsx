import type { PullRequestFilters as FilterValues } from "../types/azureDevOps";

interface PullRequestFiltersProps {
  filters: FilterValues;
  onChange: (patch: Partial<FilterValues>) => void;
}

const toggles: [keyof FilterValues, string][] = [
  ["showDrafts", "Show Draft"],
  ["createdByMeOnly", "Created by me only"],
  ["reviewerContainsMeOnly", "Reviewer contains me only"],
];

export function PullRequestFilters({ filters, onChange }: PullRequestFiltersProps) {
  return (
    <fieldset className="pr-filter-toggles">
      <legend>Filter pull requests</legend>
      <div className="pr-toggle-options">
        {toggles.map(([key, label]) => (
          <label className="pr-toggle" key={key}>
            <input
              type="checkbox"
              role="switch"
              checked={filters[key]}
              onChange={event => onChange({ [key]: event.target.checked })}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
      <p>Turn off Show Draft to hide drafts. Enabled filters are combined.</p>
    </fieldset>
  );
}
