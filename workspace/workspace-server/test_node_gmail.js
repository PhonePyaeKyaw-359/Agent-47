const { google } = require('googleapis');
const fs = require('fs');

async function run() {
  const tokens = JSON.parse(fs.readFileSync('../../.tokens.json'))['face'];
  
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: tokens.access_token });
  
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  
  const message = "To: pyaep3596@gmail.com\r\nSubject: testing\r\n\r\nhello there";
  const encoded = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
      
  console.log("Sending...");
  try {
      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encoded,
        },
      });
      console.log("Done:", response.data);
  } catch (e) {
      console.error("Error:", e);
  }
}
run();
