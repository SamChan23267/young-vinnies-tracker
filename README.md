# Young Vinnies Volunteer Hour Tracker

A simple web application to track volunteer hours for a student group.

## Features

- **User Authentication**: Secure login system to ensure only authorized leaders can access the application
- **Multi-Admin Support**: Multiple administrators can access the system with different credentials
- **Role-Based Access**: Super admin role for accessing system audit logs
- **Member Management**: Add and view members with auto-generated unique codes
- **Session Management**: Create service sessions and track attendance
- **Attendance Tracking**: Mark which members attended each session
- **Flexible Data Export**: Export session data in multiple CSV formats (horizontal, vertical, summary)
- **Comprehensive Audit Logging**: All data modifications are automatically logged with username tracking

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

Start the server:
```bash
npm start
```

The application will be available at `http://localhost:3000`

## Login Credentials

**Available Users:**

| Username | Password | Role | Access Level |
|----------|----------|------|--------------|
| admin | vinnies2024 | Super Admin | Full access + audit log viewer |
| leader1 | leader123 | Admin | Full access to members and sessions |
| leader2 | leader456 | Admin | Full access to members and sessions |

> **Security Note**: This application is designed for internal use in a trusted environment. For production deployment:
> - Change the default credentials in users.json
> - Store credentials in environment variables
> - Implement password hashing (bcrypt/argon2)
> - Enable HTTPS and set secure cookie flag
> - Consider adding CSRF protection
> - The current implementation uses plaintext passwords for simplicity - suitable for a small school group but not for public-facing applications
> - Store credentials in environment variables
> - Implement password hashing (bcrypt/argon2)
> - Enable HTTPS and set secure cookie flag
> - Consider adding CSRF protection
> - The current implementation uses plaintext passwords for simplicity - suitable for a small school group but not for public-facing applications

## Usage

### Logging In
1. Navigate to `http://localhost:3000`
2. You will be automatically redirected to the login page
3. Enter the username and password
4. Click "Login" to access the application

### Logging Out
- Click the "Logout" button in the top-right corner of any page
- You will be redirected to the login page

### Adding Members
1. After logging in, go to the "Member Management" section
2. Enter a member's name
3. Click "Add Member" - a unique code will be automatically generated

### Creating Sessions
1. In the "Session Management" section, enter a date and description
2. Click "Create Session"
3. The session will appear in the "Past Sessions" list

### Recording Attendance
1. Click "View/Edit Attendance" on any session
2. Check the boxes next to members who attended
3. Click "Save Attendance"

### Exporting Data
1. On the main page, go to the "Data Export" section
2. Select the export format:
   - **Horizontal**: One row per member per session (detailed format)
   - **Vertical**: Members as rows, sessions as columns (attendance matrix)
   - **Summary**: Total sessions attended per member
3. Select the date format:
   - **Combined with event name**: Event name includes date (e.g., "Beach Cleanup (2024-03-15)")
   - **Separate column**: Date in its own column
4. Click "Export to CSV"
5. The file will be downloaded automatically

### Viewing Audit Log (Super Admin Only)
1. Login as a super admin (e.g., admin/vinnies2024)
2. On the main page, you'll see the "Administrator Tools" section
3. Click "View Audit Log"
4. Review all system activities with timestamps and usernames
5. Each entry shows who made the change, when, and what was changed

## File Structure

```
├── index.js              # Express server with API endpoints
├── package.json          # Node.js project configuration
├── data.json             # Data storage (members and sessions)
├── audit_log.json        # Audit log of all changes with usernames
├── users.json            # User accounts with roles
├── public/
│   ├── index.html        # Main page
│   ├── login.html        # Login page
│   ├── session.html      # Session attendance page
│   ├── audit-log.html    # Audit log viewer (super admin only)
│   ├── style.css         # Styling
│   └── script.js         # Frontend JavaScript
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
- `GET /api/export/csv?format=horizontal&dateFormat=combined` - Export data to CSV
  - Format options: `horizontal`, `vertical`, `summary`
  - Date format options: `combined`, `separate`

### Super Admin Only
- `GET /api/audit-log` - View complete system audit log

## License

MIT