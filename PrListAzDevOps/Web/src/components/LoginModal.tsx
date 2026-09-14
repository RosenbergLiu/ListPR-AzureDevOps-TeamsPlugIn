import React, { useState } from "react";
import { signInWithEntra, signInWithToken } from "../services/authService";
import { UserProfile } from "../types/azureDevOps";
import type { LoginState } from "../services/tabSession";

interface LoginModalProps {
  state: LoginState;
  onChange: (patch: Partial<LoginState>) => void;
  onClose: () => void;
  onSuccess: (user: UserProfile) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ state, onChange, onClose, onSuccess }) => {
  const { isOpen, authTab, clientId, tenantId } = state;
  const [token, setToken] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleEntraSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId.trim()) {
      setError("Please enter your Microsoft Entra Client ID.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const user = await signInWithEntra(clientId.trim(), tenantId.trim() || undefined);
      onSuccess(user);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed. Please check your App Registration settings.");
    } finally {
      setLoading(false);
    }
  };

  const handlePatSignIn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!token.trim()) {
      setError("Please enter your Personal Access Token or Bearer Token.");
      return;
    }

    try {
      const user = signInWithToken(token.trim());
      setToken("");
      onSuccess(user);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid token provided.");
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Sign In to Azure DevOps</h2>
          <button className="btn-close" onClick={onClose} aria-label="Close modal">
            &times;
          </button>
        </div>

        <div className="auth-tab-buttons">
          <button
            type="button"
            className={`tab-btn ${authTab === "entra" ? "active" : ""}`}
            onClick={() => {
              onChange({ authTab: "entra" });
              setError(null);
            }}
          >
            Microsoft Entra ID
          </button>
          <button
            type="button"
            className={`tab-btn ${authTab === "pat" ? "active" : ""}`}
            onClick={() => {
              onChange({ authTab: "pat" });
              setError(null);
            }}
          >
            Personal Access Token
          </button>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        {authTab === "entra" ? (
          <form onSubmit={handleEntraSignIn} className="auth-form">
            <p className="form-help-text">
              Sign in with your organizational Microsoft account using an Entra App Registration configured for Azure DevOps delegated access.
            </p>
            <div className="form-group">
              <label htmlFor="clientId">Application (client) ID *</label>
              <input
                id="clientId"
                type="text"
                className="form-control"
                placeholder="e.g. 00000000-0000-0000-0000-000000000000"
                value={clientId}
                onChange={(e) => onChange({ clientId: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="tenantId">Directory (tenant) ID (Optional)</label>
              <input
                id="tenantId"
                type="text"
                className="form-control"
                placeholder="e.g. your-tenant-id or leave empty for common"
                value={tenantId}
                onChange={(e) => onChange({ tenantId: e.target.value })}
              />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? "Signing in..." : "Sign In with Microsoft"}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handlePatSignIn} className="auth-form">
            <p className="form-help-text">
              Authenticate using an Azure DevOps Personal Access Token (PAT) with <strong>Code (Read)</strong> scope.
              The token is kept in this browser session to retain sign-in when switching Teams tabs. Sign Out clears it.
            </p>
            <div className="form-group">
              <label htmlFor="patToken">Personal Access Token *</label>
              <input
                id="patToken"
                type="password"
                className="form-control"
                placeholder="Enter your Azure DevOps PAT"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                required
              />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Sign In
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
