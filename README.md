# Azure DevOps Pull Requests - Teams Tab

A Microsoft Teams Tab app for viewing and tracking active Azure DevOps pull requests across projects and repositories. Runs directly in Teams without external cloud hosting dependencies.

## Key Features

- **Entra ID & PAT Authentication**: Interactive Microsoft Entra ID sign-in or Personal Access Token (PAT) fallback.
- **Dedicated Settings Page**: Configure the organization, project, and optional repository separately from the PR list.
- **Repository Search**: Quickly filter repository names with a case-insensitive search while keeping the current selection and the All Repositories option available.
- **Rich PR Details**: Branch flows, draft status badges, reviewer votes, and Azure DevOps links.
- **Pagination & Refresh**: 20 PRs per page with "Load More" and manual refresh.
- **Teams Fluent Theming**: Supports Light, Dark, and High Contrast modes.
- **Tab Session Restore**: Sign-in, selections, current page, repository search, loaded PR pages, theme, and scroll position survive switching away and returning.

## Quick Start (Local Run)

| Step | Command / Action |
| --- | --- |
| 1. Install & Build Web | `npm --prefix .\PrListAzDevOps\Web install` then `npm --prefix .\PrListAzDevOps\Web run build` (includes TypeScript checking) |
| 2. Build .NET Backend | `dotnet build .\PrListAzDevOps\PrListAzDevOps.csproj` |
| 3. Launch in Teams | Press **F5** in Visual Studio or run via Microsoft 365 Agents Toolkit. |

For the full solution, use **Build Solution** in Visual Studio 2026 with Microsoft 365 Agents Toolkit installed, or its 64-bit MSBuild (`MSBuild\Current\Bin\amd64\MSBuild.exe`) with `.\PrListAzDevOps.slnx /t:Build`.
Plain `dotnet build` of the solution cannot resolve the Visual Studio-provided `Microsoft.TeamsFx.Sdk`; use the backend project command above for CLI builds.
TypeScript checking runs through npm; the duplicate Visual Studio TypeScript compilation is disabled so both build paths use the project's compiler.

## Choosing Projects and Repositories

1. Sign in, then open **Settings** from the app navigation.
2. Enter your Azure DevOps organization and choose a project.
3. Use **Search repositories** to narrow the repository dropdown by name, then choose a repository or **All Repositories**. Searching does not change the selection; **Clear search** restores the full list. Changing the organization or project clears the repository selection and search.
4. Changes apply automatically. Return to **Pull Requests** to see the current source summary and PR list. **Refresh** and **Load More** remain on this page.

## Entra ID App Registration (Optional for SSO)

1. Register an application in [Microsoft Entra admin center](https://entra.microsoft.com).
2. Add API permission: **Azure DevOps** -> Delegated permissions -> `user_impersonation` (`vso.code`).
3. Enable SPA / Web redirect URI pointing to your tab origin (e.g. `https://localhost:44302/tabs/test`).
4. Enter your Client ID when clicking **Sign In** in the Teams Tab.

## Public Repository Safety

This repository contains **no credentials, secret keys, or company-specific data**. All configuration is parameterized and local environment files (`.env.*`, `*.user`, `bin/`, `obj/`) are gitignored.

## Session Persistence

- State is scoped to the current Teams user and tab in browser `sessionStorage`, not permanent `localStorage`; closing the browser/Teams webview session clears it.
- Microsoft sign-in is restored from [MSAL's session cache](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/caching); tokens renew silently when possible. Expired consent or revoked credentials still require sign-in.
- PAT sign-in retains the PAT only in session storage. **Sign Out** clears the app session and its Microsoft account cache without signing out of Teams.
- Returning restores loaded pages without resetting to page one; **Refresh** deliberately reloads page one. Unfinished requests resume, and storage failures display a warning.
- Run the production-module regression tests with Node.js 24: `npm --prefix .\PrListAzDevOps\Web test`.
