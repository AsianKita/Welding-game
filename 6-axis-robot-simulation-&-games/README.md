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

1. RUN THE GAME LOCALLY
--------------------------------------------------
Open Command Prompt and run:

cd "C:\Users\joshv\Welding-game\6-axis-robot-simulation-games"
npm run dev

Open your browser to: http://localhost:3000/


2. PUSH EDITS (COPILOT OR MANUAL CHANGES)
--------------------------------------------------
Open a SECOND Command Prompt window and run:

cd "C:\Users\joshv\Welding-game\6-axis-robot-simulation-games"
git status
git add .
git commit -m "Update robot simulation features"
git push origin copilot/fix-weld-bead-visuals


3. CLONE FROM SCRATCH (FRESH START / NEW MACHINE)
--------------------------------------------------
Open Command Prompt and run:

git clone https://YOUR_GITHUB_TOKEN@github.com/AsianKita/Welding-game.git
cd "Welding-game"
git checkout copilot/fix-weld-bead-visuals
ren "6-axis-robot-simulation-&-games" "6-axis-robot-simulation-games"
cd "6-axis-robot-simulation-games"
npm install
npm run dev
