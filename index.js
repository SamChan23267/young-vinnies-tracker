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
  const protectedPages = ['/', '/index.html', '/session.html', '/audit-log.html', '/members.html', '/sessions.html', '/export.html'];
  if (protectedPages.includes(req.path)) {
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
const USERS_FILE = path.join(__dirname, 'users.json');

// Helper function to read users
async function readUsers() {
  try {
    const data = await fs.readFile(USERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading users:', error);
    return [];
  }
}

// Authentication middleware for API routes
function requireAuth(req, res, next) {
  if (!req.session.authenticated) {
    return res.status(401).json({ error: 'Unauthorized. Please login first.' });
  }
  next();
}

// Super admin middleware
function requireSuperAdmin(req, res, next) {
  if (!req.session.authenticated || req.session.role !== 'super_admin') {
    return res.status(403).json({ error: 'Forbidden. Super admin access required.' });
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
async function logAudit(action, data, username) {
  try {
    const logData = await fs.readFile(AUDIT_LOG_FILE, 'utf8');
    const logs = JSON.parse(logData);
    logs.push({
      timestamp: new Date().toISOString(),
      username: username || 'unknown',
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
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  
  try {
    const users = await readUsers();
    const user = users.find(u => u.username === username && u.password === password);
    
    if (user) {
      req.session.authenticated = true;
      req.session.username = username;
      req.session.role = user.role;
      req.session.displayName = user.displayName;
      res.json({ 
        success: true, 
        message: 'Login successful',
        role: user.role,
        displayName: user.displayName
      });
    } else {
      res.status(401).json({ error: 'Invalid username or password' });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
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
  res.json({ 
    authenticated: !!req.session.authenticated,
    username: req.session.username,
    role: req.session.role,
    displayName: req.session.displayName
  });
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
    await logAudit('ADD_MEMBER', newMember, req.session.username);
    
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
    await logAudit('CREATE_SESSION', newSession, req.session.username);
    
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
    }, req.session.username);
    
    res.json(data.sessions[sessionIndex]);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update attendance' });
  }
});

// GET /api/export/csv - Generate and return a CSV file of all session attendance data
app.get('/api/export/csv', requireAuth, async (req, res) => {
  try {
    const data = await readData();
    const format = req.query.format || 'horizontal'; // horizontal, vertical, summary
    const dateFormat = req.query.dateFormat || 'combined'; // combined, separate
    const sessionsParam = req.query.sessions; // comma-separated session IDs
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    
    // Filter sessions based on parameters
    let filteredSessions = data.sessions;
    
    // Filter by specific session IDs if provided
    if (sessionsParam) {
      const sessionIds = sessionsParam.split(',');
      filteredSessions = filteredSessions.filter(s => sessionIds.includes(s.id));
    }
    
    // Filter by date range if provided
    if (startDate) {
      filteredSessions = filteredSessions.filter(s => new Date(s.date) >= new Date(startDate));
    }
    if (endDate) {
      filteredSessions = filteredSessions.filter(s => new Date(s.date) <= new Date(endDate));
    }
    
    let csv = '';
    let filename = 'volunteer_hours.csv';
    
    if (format === 'horizontal') {
      // Horizontal format: Session Date, Session Description, Attended Member Codes
      if (dateFormat === 'combined') {
        csv = 'Session Date,Session Description,Attended Member Codes\n';
        filteredSessions.forEach(session => {
          if (session.attendees.length === 0) {
            csv += `"${session.date}","${session.description}",""\n`;
          } else {
            session.attendees.forEach(attendeeCode => {
              csv += `"${session.date}","${session.description}","${attendeeCode}"\n`;
            });
          }
        });
      } else {
        // Separate date format
        csv = 'Event Name,Session Date,Attended Member Codes\n';
        filteredSessions.forEach(session => {
          if (session.attendees.length === 0) {
            csv += `"${session.description}","${session.date}",""\n`;
          } else {
            session.attendees.forEach(attendeeCode => {
              csv += `"${session.description}","${session.date}","${attendeeCode}"\n`;
            });
          }
        });
      }
      filename = 'volunteer_hours_horizontal.csv';
    } else if (format === 'vertical') {
      // Vertical format: Members as rows, Sessions as columns
      const members = data.members;
      const sessions = filteredSessions;
      
      // Header row
      if (dateFormat === 'combined') {
        csv = 'Member Code,Member Name';
        sessions.forEach(session => {
          csv += `,"${session.description} (${session.date})"`;
        });
      } else {
        csv = 'Member Code,Member Name';
        sessions.forEach(session => {
          csv += `,"${session.description}","Date"`;
        });
      }
      csv += '\n';
      
      // Data rows
      members.forEach(member => {
        csv += `"${member.code}","${member.name}"`;
        sessions.forEach(session => {
          const attended = session.attendees.includes(member.code);
          if (dateFormat === 'combined') {
            csv += `,${attended ? 'X' : ''}`;
          } else {
            csv += `,${attended ? 'X' : ''},"${attended ? session.date : ''}"`;
          }
        });
        csv += '\n';
      });
      filename = 'volunteer_hours_vertical.csv';
    } else if (format === 'summary') {
      // Summary format: Member totals
      csv = 'Member Code,Member Name,Total Sessions Attended\n';
      data.members.forEach(member => {
        const totalSessions = filteredSessions.filter(session => 
          session.attendees.includes(member.code)
        ).length;
        csv += `"${member.code}","${member.name}",${totalSessions}\n`;
      });
      filename = 'volunteer_hours_summary.csv';
    }
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: 'Failed to export CSV' });
  }
});

// GET /api/audit-log - Get audit log (super admin only)
app.get('/api/audit-log', requireSuperAdmin, async (req, res) => {
  try {
    const logData = await fs.readFile(AUDIT_LOG_FILE, 'utf8');
    const logs = JSON.parse(logData);
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
