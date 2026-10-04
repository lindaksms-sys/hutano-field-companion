# Add demo login details to the project page on GitHub

## What changes
- Add a short "Demo access" section near the top of the project description that GitHub shows (README):
  - Live site link
  - Email: info@creativehauz.space
  - Password: the one you gave in chat
  - A note that the account holds synthetic demo data only, and that no real patient information may be entered
  - Steps: open the live site, tap Sign in, use these details, then open Sync to see uploaded records
- Change nothing else in the app.

## Before you approve: risks
- If the repository is public, anyone can read the password. They could sign in and upload records, or change the password and lock reviewers out.
- Safer option: create a separate demo-only account (for example a demo@ address) instead of your main business email, and change its password after submission.
- Records saved on one phone stay on that phone. Reviewers signing in elsewhere will only see what is on their own device. The app has no download from the server.

## Technical details
- Edit `README.md` only (add a "Demo access" section under the title).
- No code, secrets or settings changes.
