import React from "react";
import { GitPullRequest, PullRequestReviewer } from "../types/azureDevOps";
import { formatBranch, formatTimeAgo } from "../services/azureDevOpsService";

interface PullRequestCardProps {
  pr: GitPullRequest;
  organization: string;
}

function getWebUrl(pr: GitPullRequest, organization: string): string {
  if (pr._links?.web?.href) {
    return pr._links.web.href;
  }
  // Construct default Azure DevOps PR web URL
  const org = encodeURIComponent(organization.trim());
  const project = encodeURIComponent(pr.repository?.project?.name || "");
  const repo = encodeURIComponent(pr.repository?.name || "");
  return `https://dev.azure.com/${org}/${project}/_git/${repo}/pullrequest/${pr.pullRequestId}`;
}

function getVoteBadge(reviewer: PullRequestReviewer) {
  let badgeClass = "vote-none";
  let title = `${reviewer.displayName}: No vote`;
  let symbol = "○";

  if (reviewer.vote === 10) {
    badgeClass = "vote-approved";
    title = `${reviewer.displayName}: Approved`;
    symbol = "✓";
  } else if (reviewer.vote === 5) {
    badgeClass = "vote-approved-suggestions";
    title = `${reviewer.displayName}: Approved with suggestions`;
    symbol = "✓*";
  } else if (reviewer.vote === -5) {
    badgeClass = "vote-waiting";
    title = `${reviewer.displayName}: Waiting for author`;
    symbol = "⏳";
  } else if (reviewer.vote === -10) {
    badgeClass = "vote-rejected";
    title = `${reviewer.displayName}: Rejected`;
    symbol = "✕";
  }

  const initial = reviewer.displayName ? reviewer.displayName.charAt(0).toUpperCase() : "?";

  return (
    <span key={reviewer.id} className={`reviewer-badge ${badgeClass}`} title={title}>
      <span className="reviewer-initial">{initial}</span>
      <span className="vote-symbol">{symbol}</span>
    </span>
  );
}

export const PullRequestCard: React.FC<PullRequestCardProps> = ({ pr, organization }) => {
  const webUrl = getWebUrl(pr, organization);
  const sourceBranch = formatBranch(pr.sourceRefName);
  const targetBranch = formatBranch(pr.targetRefName);
  const authorName = pr.createdBy?.displayName || "Unknown";
  const authorInitial = authorName.charAt(0).toUpperCase();

  return (
    <div className={`pr-card ${pr.isDraft ? "pr-card-draft" : ""}`}>
      <div className="pr-card-header">
        <div className="pr-title-row">
          <span className="pr-id">#{pr.pullRequestId}</span>
          <a
            href={webUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="pr-title-link"
            title="Open in Azure DevOps"
          >
            {pr.title}
          </a>
        </div>
        <div className="pr-badges">
          {pr.isDraft && <span className="badge badge-draft">Draft</span>}
          <span className="badge badge-active">Active</span>
        </div>
      </div>

      <div className="pr-meta-row">
        <div className="pr-repo-branch">
          <span className="repo-pill" title={`Repository: ${pr.repository?.name}`}>
            📦 {pr.repository?.name || "Repository"}
          </span>
          <span className="branch-flow">
            <span className="branch-name" title={`Source: ${sourceBranch}`}>
              {sourceBranch}
            </span>
            <span className="branch-arrow">➔</span>
            <span className="branch-name target-branch" title={`Target: ${targetBranch}`}>
              {targetBranch}
            </span>
          </span>
        </div>

        <div className="pr-author-time">
          <span className="author-pill" title={`Created by ${authorName}`}>
            <span className="author-avatar">{authorInitial}</span>
            <span className="author-name">{authorName}</span>
          </span>
          <span className="time-pill" title={`Created on ${new Date(pr.creationDate).toLocaleString()}`}>
            🕒 {formatTimeAgo(pr.creationDate)}
          </span>
        </div>
      </div>

      {pr.reviewers && pr.reviewers.length > 0 && (
        <div className="pr-reviewers-row">
          <span className="reviewers-label">Reviewers:</span>
          <div className="reviewers-list">
            {pr.reviewers.map((r) => getVoteBadge(r))}
          </div>
        </div>
      )}
    </div>
  );
};
