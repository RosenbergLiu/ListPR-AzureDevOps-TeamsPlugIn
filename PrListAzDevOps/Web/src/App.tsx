import { Header } from "./components/Header";
import { LoginModal } from "./components/LoginModal";
import { Settings } from "./components/Settings";
import { PullRequestList } from "./components/PullRequestList";
import { PullRequestFilters } from "./components/PullRequestFilters";
import { useTabSession } from "./hooks/useTabSession";
import "./App.css";

export default function App() {
  const {
    view, user, ready, signingOut, sessionError, storageError, signedIn, signedOut,
    updateLogin, changeOrganization, changeProject, addRepository, removeRepository, changePage, changeRepositorySearch, refresh, loadMore,
    retryProjects, retryRepositories, retryPrs, changePrFilters,
  } = useTabSession();
  const {
    theme, page, repositoryList, pullRequests, hasMore, prError, login,
  } = view;
  const isLoadingPrs = view.prsStatus === "idle" && pullRequests.length === 0;
  const isLoadingMore = view.prsStatus === "idle" && pullRequests.length > 0;

  if (!ready || signingOut) {
    return <div className="list-loading-state" role="status">{signingOut ? "Signing out..." : "Restoring your tab session..."}</div>;
  }

  return (
    <div className={`teams-tab-app theme-${theme}`}>
      <Header
        user={user}
        onSignInClick={() => updateLogin({ isOpen: true })}
        onSignOut={() => void signedOut()}
      />

      <main className="app-main-content">
        {storageError && <div className="alert alert-danger" role="alert">{storageError}</div>}
        {sessionError && <div className="alert alert-danger" role="alert">{sessionError}</div>}
        {!user ? (
          <div className="unauthenticated-welcome">
            <div className="welcome-card">
              <div className="welcome-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.71 8.21a3.5 3.5 0 0 0-4.95 0l-.88.88-.88-.88a3.5 3.5 0 0 0-4.95 4.95l.88.88-3.05 3.05a1.5 1.5 0 1 0 2.12 2.12l3.05-3.05.88.88a3.5 3.5 0 0 0 4.95 0l4.95-4.95a3.5 3.5 0 0 0-.08-4.97zM6.46 17.06a.5.5 0 1 1 .71-.71.5.5 0 0 1-.71.71zm9.12-6.88l-3.54 3.54a1.5 1.5 0 0 1-2.12-2.12l3.54-3.54a1.5 1.5 0 0 1 2.12 2.12z" />
                </svg>
              </div>
              <h2>Sign in to view active Pull Requests</h2>
              <p>
                Connect to Azure DevOps with your Microsoft Entra ID account or Personal Access Token to explore active pull requests across your projects.
              </p>
              <button className="btn btn-primary btn-lg" onClick={() => updateLogin({ isOpen: true })}>
                Sign In to Azure DevOps
              </button>
            </div>
          </div>
        ) : (
          <div className="authenticated-view">
            <nav className="page-navigation" aria-label="App pages">
              <button className={`btn ${page === "prs" ? "btn-primary" : "btn-secondary"}`}
                aria-current={page === "prs" ? "page" : undefined} onClick={() => changePage("prs")}>Pull Requests</button>
              <button className={`btn ${page === "settings" ? "btn-primary" : "btn-secondary"}`}
                aria-current={page === "settings" ? "page" : undefined} onClick={() => changePage("settings")}>Settings</button>
            </nav>
            {page === "prs" && <PullRequestFilters filters={view.prFilters} onChange={changePrFilters} />}
            {page === "settings" ? (
              <Settings
                view={view}
                onOrganizationChange={changeOrganization}
                onProjectChange={changeProject}
                onSearchChange={changeRepositorySearch}
                onAddRepository={addRepository}
                onRemoveRepository={removeRepository}
                onRetryProjects={retryProjects}
                onRetryRepositories={retryRepositories}
              />
            ) : repositoryList.length === 0 ? (
              <div className="prompt-state">
                <h2>No repositories selected</h2>
                <p>Add repositories in Settings to display their active pull requests here.</p>
                <button className="btn btn-primary" onClick={() => changePage("settings")}>Add repositories in Settings</button>
              </div>
            ) : (
              <section aria-labelledby="pull-requests-title">
                <div className="pr-page-heading">
                  <div>
                    <h2 id="pull-requests-title">Active pull requests</h2>
                    <p>From {repositoryList.length} selected repositor{repositoryList.length === 1 ? "y" : "ies"}. Manage the list in Settings.</p>
                  </div>
                  <button className="btn btn-secondary" onClick={refresh} disabled={isLoadingPrs || isLoadingMore}>Refresh</button>
                </div>
                <PullRequestList
                  pullRequests={pullRequests}
                  isLoading={isLoadingPrs}
                  isLoadingMore={isLoadingMore}
                  error={prError}
                  hasMore={hasMore}
                  onLoadMore={loadMore}
                  onRetry={retryPrs}
                />
              </section>
            )}
          </div>
        )}
      </main>

      <LoginModal
        state={login}
        onChange={updateLogin}
        onClose={() => updateLogin({ isOpen: false })}
        onSuccess={signedIn}
      />
    </div>
  );
}
