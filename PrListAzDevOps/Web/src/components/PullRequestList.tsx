import React from "react";
import { GitPullRequest } from "../types/azureDevOps";
import { PullRequestCard } from "./PullRequestCard";

interface PullRequestListProps {
  pullRequests: GitPullRequest[];
  organization: string;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  onLoadMore: () => void;
  onRetry: () => void;
}

export const PullRequestList: React.FC<PullRequestListProps> = ({
  pullRequests,
  organization,
  isLoading,
  isLoadingMore,
  error,
  hasMore,
  onLoadMore,
  onRetry,
}) => {
  if (isLoading) {
    return (
      <div className="list-loading-state">
        <div className="spinner" />
        <p>Loading active pull requests...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="list-error-state">
        <div className="error-icon">⚠️</div>
        <h3>Failed to load pull requests</h3>
        <p className="error-message">{error}</p>
        <button className="btn btn-primary" onClick={onRetry}>
          Try Again
        </button>
      </div>
    );
  }

  if (pullRequests.length === 0) {
    return (
      <div className="list-empty-state">
        <div className="empty-icon">🎉</div>
        <h3>No active pull requests</h3>
        <p>There are no active pull requests for the selected organization, project, and repository.</p>
      </div>
    );
  }

  return (
    <div className="pr-list-container">
      <div className="pr-list-summary">
        <span>
          Showing <strong>{pullRequests.length}</strong> active pull request{pullRequests.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="pr-list">
        {pullRequests.map((pr) => (
          <PullRequestCard key={pr.pullRequestId} pr={pr} organization={organization} />
        ))}
      </div>

      {hasMore && (
        <div className="load-more-container">
          <button
            className="btn btn-secondary btn-load-more"
            onClick={onLoadMore}
            disabled={isLoadingMore}
          >
            {isLoadingMore ? "Loading more..." : "Load More (20)"}
          </button>
        </div>
      )}
    </div>
  );
};
