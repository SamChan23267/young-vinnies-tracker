const express = require('express');
const session = require('express-session');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Session configuration
app.use(session({
  secret: 'young-vinnies-secret-key-2024', // TODO: Move to environment variable in production
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false, // Set to true if using HTTPS in production
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Static files - but check auth for main pages
app.use((req, res, next) => {
  // Allow access to login page, static assets, and API endpoints
  if (req.path.includes('/login.html') || 
      req.path.includes('.css') || 
      req.path.includes('.js') ||
      req.path.startsWith('/api/')) {
    return next();
  }
  
  // For main pages, check authentication
  if (req.path === '/' || req.path === '/index.html' || req.path === '/session.html') {
    if (!req.session.authenticated) {
      return res.redirect('/login.html');
    }
  }
  
  next();
});

app.use(express.static('public'));

// File paths
const DATA_FILE = path.join(__dirname, 'data.json');
const AUDIT_LOG_FILE = path.join(__dirname, 'audit_log.json');

// Hardcoded credentials (in production, use a database with hashed passwords)
// TODO: Implement proper user management with bcrypt password hashing
const VALID_CREDENTIALS = {
  username: 'admin',
  password: 'vinnies2024'
};

// Authentication middleware for API routes
function requireAuth(req, res, next) {
  if (!req.session.authenticated) {
    return res.status(401).json({ error: 'Unauthorized. Please login first.' });
  }
  next();
}

// Helper function to read data
async function readData() {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading data:', error);
    return { members: [], sessions: [] };
  }
}

// Helper function to write data
async function writeData(data) {
  await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
}

// Helper function to log audit entry
async function logAudit(action, data) {
  try {
    const logData = await fs.readFile(AUDIT_LOG_FILE, 'utf8');
    const logs = JSON.parse(logData);
    logs.push({
      timestamp: new Date().toISOString(),
      action,
      data
    });
    await fs.writeFile(AUDIT_LOG_FILE, JSON.stringify(logs, null, 2));
  } catch (error) {
    console.error('Error logging audit:', error);
  }
}

// Helper function to generate unique member code
function generateMemberCode(name, existingCodes) {
  // Remove special characters and convert to uppercase
  const cleanName = name.replace(/[^a-zA-Z\s]/g, '').toUpperCase();
  const words = cleanName.split(/\s+/).filter(w => w.length > 0);
  
  let code = '';
  
  if (words.length === 1) {
    // Single name: take first 6 letters
    code = words[0].substring(0, 6);
  } else if (words.length >= 2) {
    // Multiple names: First name + first letter of last name
    const firstName = words[0];
    const lastInitial = words[words.length - 1].charAt(0);
    code = (firstName.substring(0, 5) + lastInitial).substring(0, 6);
  }
  
  // Ensure uniqueness by adding numbers if needed
  let finalCode = code;
  let counter = 1;
  while (existingCodes.includes(finalCode)) {
    finalCode = code + counter;
    counter++;
  }
  
  return finalCode;
}

// Generate unique session ID
function generateSessionId(existingSessions) {
  let maxId = 0;
  existingSessions.forEach(session => {
    const id = parseInt(session.id);
    if (id > maxId) maxId = id;
  });
  return (maxId + 1).toString();
}

// API Endpoints

// Authentication Endpoints

// POST /api/login - Authenticate user
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  
  if (username === VALID_CREDENTIALS.username && password === VALID_CREDENTIALS.password) {
    req.session.authenticated = true;
    req.session.username = username;
    res.json({ success: true, message: 'Login successful' });
  } else {
    res.status(401).json({ error: 'Invalid username or password' });
  }
});

// POST /api/logout - Logout user
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.json({ success: true, message: 'Logout successful' });
  });
});

// GET /api/check-auth - Check if user is authenticated
app.get('/api/check-auth', (req, res) => {
  res.json({ authenticated: !!req.session.authenticated });
});

// Data Management Endpoints (Protected)

// GET /api/members - Return all members
app.get('/api/members', requireAuth, async (req, res) => {
  try {
    const data = await readData();
    res.json(data.members);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// POST /api/members - Add a new member
app.post('/api/members', requireAuth, async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name || name.trim() === '') {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    const data = await readData();
    const existingCodes = data.members.map(m => m.code);
    const code = generateMemberCode(name.trim(), existingCodes);
    
    const newMember = {
      name: name.trim(),
      code
    };
    
    data.members.push(newMember);
    await writeData(data);
    await logAudit('ADD_MEMBER', newMember);
    
    res.status(201).json(newMember);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add member' });
  }
});

// GET /api/sessions - Return all sessions
app.get('/api/sessions', requireAuth, async (req, res) => {
  try {
    const data = await readData();
    res.json(data.sessions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

// POST /api/sessions - Create a new session
app.post('/api/sessions', requireAuth, async (req, res) => {
  try {
    const { date, description } = req.body;
    
    if (!date || !description) {
      return res.status(400).json({ error: 'Date and description are required' });
    }
    
    const data = await readData();
    const id = generateSessionId(data.sessions);
    
    const newSession = {
      id,
      date,
      description,
      attendees: []
    };
    
    data.sessions.push(newSession);
    await writeData(data);
    await logAudit('CREATE_SESSION', newSession);
    
    res.status(201).json(newSession);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// GET /api/sessions/:id - Get a specific session with attendance details
app.get('/api/sessions/:id', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const data = await readData();
    const session = data.sessions.find(s => s.id === id);
    
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// PUT /api/sessions/:id/attendance - Update attendance for a session
app.put('/api/sessions/:id/attendance', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { attendees } = req.body;
    
    if (!Array.isArray(attendees)) {
      return res.status(400).json({ error: 'Attendees must be an array' });
    }
    
    const data = await readData();
    const sessionIndex = data.sessions.findIndex(s => s.id === id);
    
    if (sessionIndex === -1) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    data.sessions[sessionIndex].attendees = attendees;
    await writeData(data);
    await logAudit('UPDATE_ATTENDANCE', {
      sessionId: id,
      attendees
    });
    
    res.json(data.sessions[sessionIndex]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update attendance' });
  }
});

// GET /api/export/csv - Generate and return a CSV file of all session attendance data
app.get('/api/export/csv', requireAuth, async (req, res) => {
  try {
    const data = await readData();
    
    // Create CSV header
    let csv = 'Session Date,Session Description,Attended Member Codes\n';
    
    // Add rows for each session and attendee
    data.sessions.forEach(session => {
      if (session.attendees.length === 0) {
        // Include sessions with no attendees
        csv += `"${session.date}","${session.description}",""\n`;
      } else {
        session.attendees.forEach(attendeeCode => {
          csv += `"${session.date}","${session.description}","${attendeeCode}"\n`;
        });
      }
    });
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=volunteer_hours.csv');
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
