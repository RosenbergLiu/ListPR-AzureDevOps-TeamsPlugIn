import React from "react";
import { UserProfile } from "../types/azureDevOps";

interface HeaderProps {
  user: UserProfile | null;
  onSignInClick: () => void;
  onSignOut: () => void;
}

export const Header: React.FC<HeaderProps> = ({ user, onSignInClick, onSignOut }) => {
  return (
    <header className="app-header">
      <div className="header-brand">
        <div className="header-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.71 8.21a3.5 3.5 0 0 0-4.95 0l-.88.88-.88-.88a3.5 3.5 0 0 0-4.95 4.95l.88.88-3.05 3.05a1.5 1.5 0 1 0 2.12 2.12l3.05-3.05.88.88a3.5 3.5 0 0 0 4.95 0l4.95-4.95a3.5 3.5 0 0 0-.08-4.97zM6.46 17.06a.5.5 0 1 1 .71-.71.5.5 0 0 1-.71.71zm9.12-6.88l-3.54 3.54a1.5 1.5 0 0 1-2.12-2.12l3.54-3.54a1.5 1.5 0 0 1 2.12 2.12z" />
          </svg>
        </div>
        <div>
          <h1 className="header-title">Azure DevOps Pull Requests</h1>
          <p className="header-subtitle">Active pull requests across your projects</p>
        </div>
      </div>

      <div className="header-user-section">
        {user ? (
          <div className="user-profile">
            <div className="user-avatar" title={user.username || user.name}>
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="user-info">
              <span className="user-name">{user.name}</span>
              <span className="user-method">
                {user.authMethod === "entra" ? "Microsoft Entra ID" : "Personal Access Token"}
              </span>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={onSignOut}>
              Sign Out
            </button>
          </div>
        ) : (
          <button className="btn btn-primary" onClick={onSignInClick}>
            Sign In
          </button>
        )}
      </div>
    </header>
  );
};
