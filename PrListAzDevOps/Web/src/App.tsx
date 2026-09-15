import { Header } from "./components/Header";
import { LoginModal } from "./components/LoginModal";
import { SettingsPage } from "./components/SettingsPage";
import { PullRequestList } from "./components/PullRequestList";
import { useTabSession } from "./hooks/useTabSession";
import "./App.css";

export default function App() {
  const {
    view, user, ready, signingOut, sessionError, storageError, signedIn, signedOut,
    updateLogin, changeOrganization, changeProject, changeRepository, refresh, loadMore,
    retryProjects, retryRepositories, retryPrs, changePage, changeRepositorySearch,
  } = useTabSession();
  const {
    theme, page, organization, projects, selectedProject, repositories, selectedRepository,
    repositorySearch, pullRequests, hasMore, prError, login,
  } = view;
  const isLoadingPrs = view.prsStatus === "idle" && pullRequests.length === 0;
  const isLoadingMore = view.prsStatus === "idle" && pullRequests.length > 0;
  const repositoryName = repositories.find(repository => repository.id === selectedRepository)?.name ?? selectedRepository;

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
            <nav className="page-navigation" aria-label="Main navigation">
              <button
                type="button"
                className={`page-nav-button ${page === "pullRequests" ? "active" : ""}`}
                aria-current={page === "pullRequests" ? "page" : undefined}
                onClick={() => changePage("pullRequests")}
              >
                Pull Requests
              </button>
              <button
                type="button"
                className={`page-nav-button ${page === "settings" ? "active" : ""}`}
                aria-current={page === "settings" ? "page" : undefined}
                onClick={() => changePage("settings")}
              >
                Settings
              </button>
            </nav>

            {page === "settings" ? (
              <SettingsPage
                organization={organization}
                onOrganizationChange={changeOrganization}
                projects={projects}
                selectedProject={selectedProject}
                onProjectChange={changeProject}
                repositories={repositories}
                selectedRepository={selectedRepository}
                onRepositoryChange={changeRepository}
                repositorySearch={repositorySearch}
                onRepositorySearchChange={changeRepositorySearch}
                isLoadingProjects={!!organization.trim() && view.projectsStatus === "idle"}
                isLoadingRepositories={!!selectedProject && view.repositoriesStatus === "idle"}
                projectsError={view.projectsError}
                repositoriesError={view.repositoriesError}
                onRetryProjects={retryProjects}
                onRetryRepositories={retryRepositories}
              />
            ) : (
              <section aria-labelledby="pull-requests-heading">
                <div className="page-heading">
                  <div>
                    <h2 id="pull-requests-heading" className="page-title">Pull Requests</h2>
                    {organization.trim() && selectedProject && (
                      <p className="page-description">
                        {organization} / {selectedProject} / {selectedRepository ? repositoryName : "All Repositories"}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary btn-refresh"
                    onClick={refresh}
                    disabled={!organization.trim() || !selectedProject || isLoadingPrs || isLoadingMore}
                    title="Refresh Pull Requests"
                  >
                    <svg
                      className={`refresh-icon ${isLoadingPrs || isLoadingMore ? "spinning" : ""}`}
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path d="M23 4v6h-6" />
                      <path d="M1 20v-6h6" />
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                    </svg>
                    Refresh
                  </button>
                </div>
                {(view.projectsError || view.repositoriesError) && (
                  <div className="alert alert-danger" role="alert">
                    {view.projectsError || view.repositoriesError}{" "}
                    <button type="button" className="btn btn-secondary" onClick={() => changePage("settings")}>Open Settings</button>
                  </div>
                )}
                {!organization.trim() || !selectedProject.trim() ? (
                  <div className="prompt-state">
                    <p>Choose your organization and project in Settings to view active pull requests.</p>
                    <button type="button" className="btn btn-primary" onClick={() => changePage("settings")}>Open Settings</button>
                  </div>
                ) : (
                  <PullRequestList
                    pullRequests={pullRequests}
                    organization={organization}
                    isLoading={isLoadingPrs}
                    isLoadingMore={isLoadingMore}
                    error={prError}
                    hasMore={hasMore}
                    onLoadMore={loadMore}
                    onRetry={retryPrs}
                  />
                )}
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
