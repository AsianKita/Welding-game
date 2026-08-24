<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/61a4fabd-3081-46da-9a8a-be9320b8ae52

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

==================================================
LOCAL DEVELOPMENT & GIT CHEAT SHEET
==================================================

cd "C:\Users\joshv\Welding-game"
git fetch origin
git checkout copilot/fix-weld-bead-visuals
git pull origin copilot/fix-weld-bead-visuals
cd 6-axis-robot-simulation-games
npm install
npm run dev

NOTE: This folder must NOT contain "&" in its name. On Windows, cmd.exe treats
"&" as a command separator, which breaks the PATH that npm builds for scripts
and makes "npm run dev" fail with "is not recognized as an internal or external
command". If you still have an old "6-axis-robot-simulation-&-games" folder
locally, delete it after pulling so you don't run a stale copy.
