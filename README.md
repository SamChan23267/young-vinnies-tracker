# Young Vinnies Volunteer Hour Tracker

A simple web application to track volunteer hours for a student group.

## 🚀 Quick Deploy to Vercel

Want to get started immediately? Deploy to Vercel in 5 minutes:

**📖 [Quick Start Guide](QUICK_START_VERCEL.md)** - Deploy in 5 minutes
**📚 [Full Vercel Deployment Guide](VERCEL_DEPLOYMENT_GUIDE.md)** - Complete step-by-step instructions

## Features

- **User Authentication**: Secure login system to ensure only authorized leaders can access the application
- **Multi-Admin Support**: Multiple administrators can access the system with different credentials
- **Role-Based Access**: Super admin role for accessing system audit logs
- **Multi-Page Application**: Organized into separate pages for better usability
- **Dashboard Overview**: Statistics and quick access to key functions
- **Member Management**: Add and view members with auto-generated unique codes, search functionality
- **Session Management**: Create service sessions and track attendance, search functionality
- **Attendance Tracking**: Mark which members attended each session
- **Advanced Data Export**: 
  - Export session data in multiple CSV formats (horizontal, vertical, summary)
  - Select specific sessions to export
  - Filter by date range
  - Choose date format options
- **Search & Filter**: Real-time search for members and sessions
- **Comprehensive Audit Logging**: All data modifications are automatically logged with username tracking
- **Responsive Design**: Works on desktop, tablet, and mobile devices

## Technology Stack

- **Backend**: Node.js with Express.js
- **Frontend**: HTML, CSS, and vanilla JavaScript
- **Database**: JSON file storage (data.json, users.json)
- **Authentication**: Express sessions with role-based access control

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/SamChan23267/young-vinnies-tracker.git
   cd young-vinnies-tracker
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Running the Application

### Development Mode

Start the server:
```bash
npm start
```

The application will be available at `http://localhost:3000`

### Production Mode

For production deployment, see the comprehensive [DEPLOYMENT.md](DEPLOYMENT.md) guide.

Quick production setup:
```bash
# Install production dependencies
npm install --production

# Create environment file
cp .env.example .env
# Edit .env with your production values

# Start server
NODE_ENV=production npm start
```

**Production Features:**
- Security headers (Helmet.js)
- Rate limiting (100 requests/15 min)
- Gzip compression
- HTTP request logging
- Health check endpoint
- Environment-based configuration
- Error handling

## Backup & Restore

### Create Backup
```bash
npm run backup
```
Creates a timestamped backup of all data files in `backups/` directory.

### Restore from Backup
```bash
npm run restore
```
Interactive restore process - select a backup to restore.

## Login Credentials

**Available Users:**

| Username | Password | Role | Access Level |
|----------|----------|------|--------------|
| admin | vinnies2026 | Super Admin | Full access + audit log viewer |
| leader1 | leader123 | Admin | Full access to members and sessions |
| leader2 | leader456 | Admin | Full access to members and sessions |

> **⚠️ Security Warning**: Change these default passwords before production deployment!

> **Production Deployment**: For production use, see [DEPLOYMENT.md](DEPLOYMENT.md) for:
> - Proper environment variable configuration
> - Session secret generation
> - HTTPS/SSL setup
> - Security hardening
> - Deployment to various platforms (Heroku, Railway, VPS, etc.)

## Usage

### Application Structure

The application is organized into multiple pages accessible via the navigation menu:

- **🏠 Dashboard** - Overview with statistics and quick actions
- **👥 Members** - Manage volunteer members
- **📅 Sessions** - Manage volunteer sessions
- **📊 Export Data** - Export attendance data with advanced filters
- **🔐 Audit Log** - View system activity (super admin only)

### Logging In
1. Navigate to `http://localhost:3000`
2. You will be automatically redirected to the login page
3. Enter the username and password
4. Click "Login" to access the dashboard

### Logging Out
- Click the "Logout" button in the top-right corner of any page
- You will be redirected to the login page

### Using the Dashboard
1. After logging in, you'll see the dashboard with:
   - Statistics cards showing total members, sessions, and attendance
   - Recent sessions list
   - Top volunteers by attendance
   - Quick action buttons
2. Click on any card's "Manage →" or "Export →" link to navigate to that section
3. Use the Quick Actions buttons to add members, create sessions, or export data

### Adding Members
1. Click "👥 Members" in the navigation menu
2. Use the search box to find existing members
3. Enter a member's name in the form
4. Click "Add Member" - a unique code will be automatically generated
5. The member appears in the table with their attendance count

### Creating Sessions
1. Click "📅 Sessions" in the navigation menu
2. Use the search box to find existing sessions
3. Enter a date and description in the form
4. Click "Create Session"
5. The session will appear in the list with an "View/Edit Attendance" button

### Recording Attendance
1. From the Sessions page, click "View/Edit Attendance" on any session
2. Check the boxes next to members who attended
3. Click "Save Attendance"
4. Return to Sessions page to see updated attendance counts

### Exporting Data
1. Click "📊 Export Data" in the navigation menu
2. Choose your export settings:
   - **Export Format**: Horizontal, Vertical, or Summary
   - **Date Format**: Combined or Separate column
   - **Date Range**: Optional start and end dates
3. Select specific sessions to export:
   - Check/uncheck individual sessions
   - Use "Select All" or "Deselect All" buttons
4. Click either:
   - **Export Selected Sessions** - exports only checked sessions
   - **Export All Sessions** - exports all sessions (respects date range if set)
5. The CSV file will be downloaded automatically

### Viewing Audit Log (Super Admin Only)
1. Login as a super admin (e.g., admin/vinnies2026)
2. The "🔐 Audit Log" link will appear in the navigation menu
3. Click "Audit Log" to view all system activities
4. Review entries with timestamps and usernames
5. Each entry shows who made the change, when, and what was changed

## File Structure

```
├── index.js              # Express server with API endpoints
├── package.json          # Node.js project configuration
├── data.json             # Data storage (members and sessions)
├── audit_log.json        # Audit log of all changes with usernames
├── users.json            # User accounts with roles
├── public/
│   ├── index.html        # Dashboard page (home)
│   ├── members.html      # Member management page
│   ├── sessions.html     # Session management page
│   ├── export.html       # Data export page with filters
│   ├── session.html      # Individual session attendance page
│   ├── audit-log.html    # Audit log viewer (super admin only)
│   ├── login.html        # Login page
│   ├── style.css         # Styling with navigation and dashboard components
│   └── script.js         # Frontend JavaScript for all pages
└── README.md             # This file
```

## API Endpoints

### Authentication
- `POST /api/login` - Authenticate user (returns role and username)
- `POST /api/logout` - Logout user
- `GET /api/check-auth` - Check authentication status and role

### Data Management (Protected - Requires Authentication)
- `GET /api/members` - Get all members
- `POST /api/members` - Add a new member (logs username in audit)
- `GET /api/sessions` - Get all sessions
- `POST /api/sessions` - Create a new session (logs username in audit)
- `GET /api/sessions/:id` - Get a specific session
- `PUT /api/sessions/:id/attendance` - Update session attendance (logs username in audit)
- `GET /api/export/csv` - Export data to CSV with filters
  - **Query Parameters:**
    - `format`: `horizontal`, `vertical`, or `summary`
    - `dateFormat`: `combined` or `separate`
    - `sessions`: Comma-separated session IDs (optional)
    - `startDate`: Filter sessions from this date (optional)
    - `endDate`: Filter sessions until this date (optional)

### Super Admin Only
- `GET /api/audit-log` - View complete system audit log

## Screenshots

**Dashboard:**
![Dashboard](https://github.com/user-attachments/assets/c78bbf75-c8ad-4a3a-b1d0-57b24664498c)

**Members Page:**
![Members](https://github.com/user-attachments/assets/823d52d8-172d-4360-ac3d-8dc9a42b7226)

**Sessions Page:**
![Sessions](https://github.com/user-attachments/assets/694fdcfc-905d-4933-ba96-9d3f49e5317a)

**Export Page:**
![Export](https://github.com/user-attachments/assets/e33241fd-013f-4616-b25a-01eb9e2dda90)

## License

MIT