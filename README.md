# Young Vinnies Volunteer Hour Tracker

A simple web application to track volunteer hours for a student group.

## Features

- **Member Management**: Add and view members with auto-generated unique codes
- **Session Management**: Create service sessions and track attendance
- **Attendance Tracking**: Mark which members attended each session
- **Data Export**: Export all session data to CSV format
- **Audit Logging**: All data modifications are automatically logged

## Technology Stack

- **Backend**: Node.js with Express.js
- **Frontend**: HTML, CSS, and vanilla JavaScript
- **Database**: JSON file storage (data.json)

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

## Usage

### Adding Members
1. Open the application in your browser
2. In the "Member Management" section, enter a member's name
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
1. Click the "Export All Sessions to CSV" button on the main page
2. A CSV file will be downloaded with all session attendance data

## File Structure

```
├── index.js              # Express server with API endpoints
├── package.json          # Node.js project configuration
├── data.json             # Data storage (members and sessions)
├── audit_log.json        # Audit log of all changes
├── public/
│   ├── index.html        # Main page
│   ├── session.html      # Session attendance page
│   ├── style.css         # Styling
│   └── script.js         # Frontend JavaScript
└── README.md             # This file
```

## API Endpoints

- `GET /api/members` - Get all members
- `POST /api/members` - Add a new member
- `GET /api/sessions` - Get all sessions
- `POST /api/sessions` - Create a new session
- `GET /api/sessions/:id` - Get a specific session
- `PUT /api/sessions/:id/attendance` - Update session attendance
- `GET /api/export/csv` - Export data to CSV

## License

MIT