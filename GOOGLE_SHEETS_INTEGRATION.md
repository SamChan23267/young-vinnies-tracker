# Google Sheets Integration Guide

## Overview
This guide explains what is needed to integrate Google Sheets export functionality into the Young Vinnies Volunteer Hour Tracker.

## Requirements

### 1. Google Cloud Project Setup
- Create a project in [Google Cloud Console](https://console.cloud.google.com/)
- Enable the Google Sheets API for your project
- Enable the Google Drive API for your project

### 2. Authentication & Authorization

#### Option A: Service Account (Recommended for Server-Side)
1. Create a service account in Google Cloud Console
2. Download the JSON key file
3. Store the key file securely (NOT in version control)
4. Share the target Google Sheet with the service account email

#### Option B: OAuth 2.0 (For User-Based Access)
1. Create OAuth 2.0 credentials in Google Cloud Console
2. Configure authorized redirect URIs
3. Implement OAuth flow in the application
4. Users authenticate with their Google account

### 3. Required NPM Packages
```bash
npm install googleapis
```

### 4. Implementation Steps

#### Backend Changes (index.js)

1. **Install and Import Google APIs:**
```javascript
const { google } = require('googleapis');
const { JWT } = require('google-auth-library');
```

2. **Configure Authentication:**
```javascript
// Using Service Account
const auth = new google.auth.GoogleAuth({
  keyFile: './path-to-service-account-key.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets']
});

// Or using OAuth2
const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);
```

3. **Create New Endpoint:**
```javascript
app.post('/api/export/googlesheet', requireAuth, async (req, res) => {
  try {
    const sheets = google.sheets({ version: 'v4', auth });
    
    // Create a new spreadsheet
    const createResponse = await sheets.spreadsheets.create({
      resource: {
        properties: {
          title: `Volunteer Hours - ${new Date().toISOString().split('T')[0]}`
        },
        sheets: [{
          properties: {
            title: 'Attendance Data'
          }
        }]
      }
    });
    
    const spreadsheetId = createResponse.data.spreadsheetId;
    
    // Prepare data (same format as CSV)
    const data = await readData();
    const values = [];
    
    // Add data rows
    data.sessions.forEach(session => {
      const row = [`${session.description} (${session.date})`];
      session.attendees.forEach(code => {
        const member = data.members.find(m => m.code === code);
        row.push(member ? member.code : code);
      });
      values.push(row);
    });
    
    // Write data to sheet
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Attendance Data!A1',
      valueInputOption: 'RAW',
      resource: {
        values
      }
    });
    
    // Return the spreadsheet URL
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
    res.json({ success: true, url });
    
  } catch (error) {
    console.error('Google Sheets error:', error);
    res.status(500).json({ error: 'Failed to create Google Sheet' });
  }
});
```

#### Frontend Changes (script.js)

Update the export button handler:
```javascript
if (exportType === 'googlesheet') {
    const response = await fetch('/api/export/googlesheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            memberDisplay,
            sessions: sessionIds || null,
            startDate,
            endDate
        })
    });
    
    const result = await response.json();
    if (result.success) {
        showMessage('Google Sheet created successfully!', 'success');
        window.open(result.url, '_blank');
    } else {
        showMessage('Failed to create Google Sheet', 'error');
    }
    return;
}
```

### 5. Environment Variables

Add to your environment or `.env` file:
```
GOOGLE_SERVICE_ACCOUNT_KEY_PATH=./google-service-account-key.json
# Or for OAuth2:
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback
```

### 6. Security Considerations

1. **Never commit credentials to version control**
   - Add service account keys to `.gitignore`
   - Use environment variables for sensitive data

2. **Limit API Scope**
   - Only request necessary permissions
   - Use read-only access where appropriate

3. **Implement Rate Limiting**
   - Google Sheets API has quotas
   - Implement retry logic with exponential backoff

4. **Share Permissions**
   - For service accounts, explicitly share sheets
   - For OAuth, respect user permissions

### 7. Testing

1. Test with a small dataset first
2. Verify formatting and data accuracy
3. Test error handling (network issues, API limits)
4. Test with different user roles

### 8. Cost Considerations

- Google Sheets API is free for most use cases
- Rate limits apply: 
  - 300 requests per minute per project
  - 60 requests per minute per user

### 9. Alternative: Google Apps Script

For simpler integration without backend changes:
1. Create a Google Apps Script
2. Deploy as web app
3. Call from frontend with data
4. Script creates and populates sheet

Example Apps Script:
```javascript
function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const ss = SpreadsheetApp.create('Volunteer Hours');
  const sheet = ss.getActiveSheet();
  
  data.sessions.forEach((session, index) => {
    const row = [session.name];
    row.push(...session.attendees);
    sheet.getRange(index + 1, 1, 1, row.length).setValues([row]);
  });
  
  return ContentService.createTextOutput(
    JSON.stringify({ url: ss.getUrl() })
  ).setMimeType(ContentService.MimeType.JSON);
}
```

## Documentation Links

- [Google Sheets API Documentation](https://developers.google.com/sheets/api)
- [Google Auth Library](https://github.com/googleapis/google-auth-library-nodejs)
- [googleapis npm package](https://www.npmjs.com/package/googleapis)
- [Google Cloud Console](https://console.cloud.google.com/)

## Summary

To implement Google Sheets integration:
1. Set up Google Cloud Project and enable APIs
2. Choose authentication method (Service Account or OAuth2)
3. Install `googleapis` npm package
4. Implement backend endpoint for sheet creation
5. Update frontend to call new endpoint
6. Secure credentials properly
7. Test thoroughly

The implementation is straightforward but requires proper Google Cloud setup and credential management.
