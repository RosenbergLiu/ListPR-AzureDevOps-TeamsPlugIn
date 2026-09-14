import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import * as teamsJs from "@microsoft/teams-js";
import type { UserProfile } from "../types/azureDevOps";
import { restoreUser, signOut } from "../services/authService";
import { fetchActivePullRequests, fetchProjects, fetchRepositories } from "../services/azureDevOpsService";
import {
  clearSession, createSession, readSession, resetPullRequests, sameIdentity, savedIdentity,
  selectOrganization, selectProject, writeSession,
} from "../services/tabSession";
import type { LoginState, TabSession, TabView } from "../services/tabSession";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "The operation failed. Please try again.";
}

export function useTabSession() {
  const [session, setSession] = useState(createSession);
  const [scope, setScope] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [ready, setReady] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const currentSession = useRef(session);
  currentSession.current = session;
  const scrollRestored = useRef(false);
  const view = session.view;

  const updateView = useCallback((update: (previous: TabView) => TabView) => {
    setSession(previous => ({ ...previous, view: update(previous.view) }));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      let sessionScope = `browser:${window.location.pathname}`;
      let teamsTheme: string | undefined;
      try {
        await teamsJs.app.initialize();
        const context = await teamsJs.app.getContext();
        sessionScope = JSON.stringify([context.user?.tenant?.id, context.user?.id, context.page.id]);
        teamsTheme = context.app.theme;
        teamsJs.app.registerOnThemeChangeHandler(theme => {
          if (!cancelled) updateView(previous => ({ ...previous, theme }));
        });
      } catch {
        console.info("Teams context is unavailable; using this browser tab's session.");
      }
      if (cancelled) return;
      let stored = createSession();
      try {
        stored = readSession(sessionScope);
      } catch (error) {
        setStorageError(`Unable to restore saved state. ${errorMessage(error)}`);
      }
      if (teamsTheme) stored.view.theme = teamsTheme;
      setSession(stored);
      setScope(sessionScope);
      try {
        const restored = stored.identity ? await restoreUser(stored.identity) : null;
        if (!cancelled) setUser(restored);
      } catch {
        if (!cancelled) setSessionError("Your saved sign-in could not be restored. Sign in again to continue; your saved filters and PR pages are retained.");
      } finally {
        if (!cancelled) setReady(true);
      }
    }
    void initialize();
    return () => { cancelled = true; };
  }, [updateView]);

  const persist = useCallback((snapshot: TabSession) => {
    if (scope === null) return;
    try {
      writeSession(scope, snapshot);
    } catch {
      setStorageError("This tab cannot save its session. Allow browser session storage to retain sign-in and state when switching tabs.");
    }
  }, [scope]);

  useEffect(() => {
    if (ready && !signingOut) persist(session);
  }, [ready, signingOut, session, persist]);

  useLayoutEffect(() => {
    if (!ready || !user || scrollRestored.current) return;
    window.scrollTo(0, currentSession.current.view.scrollY);
    scrollRestored.current = true;
  }, [ready, user]);

  useEffect(() => {
    if (!ready || signingOut) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const saveScroll = () => {
      updateView(previous => ({ ...previous, scrollY: window.scrollY }));
    };
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(saveScroll, 100);
    };
    const flush = () => {
      const snapshot = currentSession.current;
      persist({ ...snapshot, view: { ...snapshot.view, scrollY: window.scrollY } });
    };
    const onVisibilityChange = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [ready, signingOut, persist, updateView]);

  useEffect(() => {
    if (!ready || !user || !view.organization.trim() || view.projectsStatus !== "idle") return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void fetchProjects(view.organization, user).then(projects => {
        if (cancelled) return;
        updateView(previous => ({
          ...selectProject(previous, projects[0]?.name ?? ""),
          projects, projectsStatus: "ready", projectsError: null,
        }));
      }).catch(error => {
        if (!cancelled) updateView(previous => ({ ...previous, projectsStatus: "error", projectsError: errorMessage(error) }));
      });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [ready, user, view.organization, view.projectsStatus, updateView]);

  useEffect(() => {
    if (!ready || !user || !view.selectedProject || view.repositoriesStatus !== "idle") return;
    let cancelled = false;
    void fetchRepositories(view.organization, view.selectedProject, user).then(repositories => {
      if (!cancelled) updateView(previous => ({ ...previous, repositories, repositoriesStatus: "ready", repositoriesError: null }));
    }).catch(error => {
      if (!cancelled) updateView(previous => ({ ...previous, repositoriesStatus: "error", repositoriesError: errorMessage(error) }));
    });
    return () => { cancelled = true; };
  }, [ready, user, view.organization, view.selectedProject, view.repositoriesStatus, updateView]);

  useEffect(() => {
    if (!ready || !user || !view.selectedProject || view.prsStatus !== "idle") return;
    let cancelled = false;
    void fetchActivePullRequests(
      view.organization, view.selectedProject, user, view.selectedRepository || undefined,
      20, view.pullRequests.length,
    ).then(result => {
      if (!cancelled) updateView(previous => ({
        ...previous, pullRequests: [...previous.pullRequests, ...result.pullRequests],
        hasMore: result.hasMore, prsStatus: "ready", prError: null,
      }));
    }).catch(error => {
      if (!cancelled) updateView(previous => ({ ...previous, prsStatus: "error", prError: errorMessage(error) }));
    });
    return () => { cancelled = true; };
  }, [ready, user, view.organization, view.selectedProject, view.selectedRepository, view.prsStatus, view.pullRequests.length, updateView]);

  function signedIn(nextUser: UserProfile) {
    if (signingOut) return;
    setSession(previous => {
      const identity = savedIdentity(nextUser);
      const nextView = sameIdentity(previous.identity, identity) ? previous.view : createSession().view;
      return {
        version: 1, identity,
        view: { ...nextView, theme: previous.view.theme, login: { ...previous.view.login, isOpen: false } },
      };
    });
    setSessionError(null);
    setUser(nextUser);
    scrollRestored.current = false;
  }

  async function signedOut() {
    const previousUser = user;
    setSigningOut(true);
    setUser(null);
    scrollRestored.current = false;
    setSession(createSession());
    currentSession.current = createSession();
    window.scrollTo(0, 0);
    setSessionError(null);
    try {
      if (scope !== null) clearSession(scope);
    } catch {
      setStorageError("Unable to clear saved state. Close this browser session to remove its saved sign-in.");
    }
    try {
      if (previousUser) await signOut(previousUser);
    } catch {
      setSessionError("Signed out of this tab, but Microsoft token-cache cleanup failed. Close this browser session to clear the cache.");
    } finally {
      setSigningOut(false);
    }
  }

  return {
    view, user, ready, signingOut, sessionError, storageError, signedIn, signedOut,
    updateLogin: (patch: Partial<LoginState>) => updateView(previous => ({ ...previous, login: { ...previous.login, ...patch } })),
    changeOrganization: (organization: string) => updateView(previous => selectOrganization(previous, organization)),
    changeProject: (project: string) => updateView(previous => selectProject(previous, project)),
    changeRepository: (selectedRepository: string) => updateView(previous => resetPullRequests({ ...previous, selectedRepository })),
    refresh: () => updateView(resetPullRequests),
    retryPrs: () => updateView(previous => ({ ...previous, prsStatus: "idle", prError: null })),
    loadMore: () => updateView(previous => previous.prsStatus === "ready" && previous.hasMore
      ? { ...previous, prsStatus: "idle", prError: null } : previous),
    retryProjects: () => updateView(previous => ({ ...previous, projectsStatus: "idle", projectsError: null })),
    retryRepositories: () => updateView(previous => ({ ...previous, repositoriesStatus: "idle", repositoriesError: null })),
  };
}
