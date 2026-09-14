import { Header } from "./components/Header";
import { LoginModal } from "./components/LoginModal";
import { Filters } from "./components/Filters";
import { PullRequestList } from "./components/PullRequestList";
import { useTabSession } from "./hooks/useTabSession";
import "./App.css";

export default function App() {
  const {
    view, user, ready, signingOut, sessionError, storageError, signedIn, signedOut,
    updateLogin, changeOrganization, changeProject, changeRepository, refresh, loadMore,
    retryProjects, retryRepositories, retryPrs,
  } = useTabSession();
  const {
    theme, organization, projects, selectedProject, repositories, selectedRepository,
    pullRequests, hasMore, prError, login,
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
            <Filters
              organization={organization}
              onOrganizationChange={changeOrganization}
              projects={projects}
              selectedProject={selectedProject}
              onProjectChange={changeProject}
              repositories={repositories}
              selectedRepository={selectedRepository}
              onRepositoryChange={changeRepository}
              onRefresh={refresh}
              isLoadingProjects={!!organization.trim() && view.projectsStatus === "idle"}
              isLoadingRepositories={!!selectedProject && view.repositoriesStatus === "idle"}
              isLoadingPrs={isLoadingPrs || isLoadingMore}
            />

            {view.projectsError && <div className="alert alert-danger" role="alert">
              {view.projectsError} <button className="btn btn-secondary" onClick={retryProjects}>Retry projects</button>
            </div>}
            {view.repositoriesError && <div className="alert alert-danger" role="alert">
              {view.repositoriesError} <button className="btn btn-secondary" onClick={retryRepositories}>Retry repositories</button>
            </div>}
            {!organization.trim() ? (
              <div className="prompt-state">
                <p>👉 Enter your Azure DevOps organization name above to load projects.</p>
              </div>
            ) : !selectedProject.trim() ? (
              <div className="prompt-state">
                <p>👉 Select a project to view active pull requests.</p>
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
