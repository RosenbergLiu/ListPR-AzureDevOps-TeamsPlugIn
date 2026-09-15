import type { PullRequestFilters } from "../types/azureDevOps";

export const DEFAULT_PR_FILTERS: Readonly<PullRequestFilters> = {
  showDrafts: true,
  createdByMeOnly: false,
  reviewerContainsMeOnly: false,
};

export function isPullRequestFilters(value: unknown): value is PullRequestFilters {
  return typeof value === "object" && value !== null
    && "showDrafts" in value && typeof value.showDrafts === "boolean"
    && "createdByMeOnly" in value && typeof value.createdByMeOnly === "boolean"
    && "reviewerContainsMeOnly" in value && typeof value.reviewerContainsMeOnly === "boolean";
}
