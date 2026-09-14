# Azure DevOps PRs - Microsoft 365 Agent Toolkit Project

This project contains the Microsoft Teams app manifest, environment templates, and local launch configuration.

## Quick Start

1. Set up Microsoft 365 Account in Visual Studio (`Microsoft 365 Agents Toolkit > Select Microsoft 365 Account`).
2. Press **F5** in Visual Studio or select **Debug > Start Debugging** to launch the tab app in Teams.
3. In the browser or Teams client, select **Add** to install the app tab.

## Structure

- `appPackage/`: Contains `manifest.json` and app icons for Microsoft Teams.
- `env/`: Environment configuration templates (local and dev).
- `m365agents.yml` / `m365agents.local.yml`: Toolkit lifecycle automation.
