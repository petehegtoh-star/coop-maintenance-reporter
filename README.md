# Co-op Maintenance Reporter

A simple web app for reporting and tracking maintenance issues in a co-op.

## Features
- Resident and superintendent login
- Resident registration
- Maintenance issue submission
- Photo upload
- Superintendent dashboard
- Issue status tracking
- Filters by status, category, and unit
- Email notifications for new issues
- SQLite database storage

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy env file:
   ```bash
   cp .env.example .env
   ```

3. Start the app:
   ```bash
   npm start
   ```

4. Open:
   ```text
   http://localhost:3000
   ```

## Default superintendent login
Seed the default admin account:
```text
http://localhost:3000/api/seed-superintendent
```

Then login with:
- Username: superintendent
- Password: superadmin123

## Notes
- Uploaded photos go into the uploads/ folder.
- Email sending is optional; if SMTP values are not configured, the app logs a message instead of failing.
- This is a local starter app suited for a co-op maintenance workflow.

## Example test
1. Register a resident
2. Log in as resident
3. Submit a repair request
4. Log in as superintendent
5. View the request
6. Change status to In Progress or Resolved
