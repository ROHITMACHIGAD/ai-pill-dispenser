import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@deepgram/sdk';
import pg from 'pg';
import fileUpload from 'express-fileupload';
import twilio from 'twilio'; // Add Twilio import

import twilioPkg from 'twilio';

const alertCooldown = { A: null, B: null };
const app = express();
app.use(cors());
app.use(fileUpload());
app.use(express.json());
let previousCounts = { A: null, B: null }; 



const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
const pool = new pg.Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: process.env.DB_SSL === 'true'
});



const parseTime = (timeStr) => {
  const cleaned = timeStr.toUpperCase().replace(/\s/g, '');
  const [, hour, minute, period] = cleaned.match(/(\d+):?(\d*)?([AP]M)/) || [];
  let hours = parseInt(hour);
  
  if (period === 'PM' && hours !== 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  
  return `${hours.toString().padStart(2, '0')}:${(minute || '00').padStart(2, '0')}:00`;
};

app.post('/stt', async (req, res) => {
  try {
    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
      req.files.audio.data,
      { model: 'nova-2', smart_format: true }
    );
    
    if (error) throw error;
    res.json({ transcript: result.results.channels[0].alternatives[0].transcript });
  } catch (error) {
    res.status(500).json({ error: 'Audio processing failed' });
  }
});


app.get('/api/bpm', async (req, res) => {
  try {
      const { rows } = await pool.query(`
          SELECT bpm, recorded_at 
          FROM bpm 
          ORDER BY recorded_at
      `);
      res.json(rows);
  } catch (err) {
      res.status(500).json({ error: err.message });
  }
});

app.get('/api/medications', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT name, time, quantity, cnt_b, created_at
      FROM medications
      ORDER BY created_at DESC
    `);
    

    res.json(rows);
  } catch (err) {
    console.error('Database error:', err);
    res.status(500).json({ error: 'Failed to fetch medications' });
  }
});

app.get('/api/attendance', async (req, res) => {
  try {
      const { rows } = await pool.query(`
          SELECT pill_a, pill_b, recorded_date 
          FROM attendance 
          ORDER BY recorded_date
      `);
      res.json(rows);
  } catch (err) {
      res.status(500).json({ error: err.message });
  }
});


app.post('/store', async (req, res) => {
  try {
    const { pillA, pillB, cntA, cntB } = req.body;
    
    // Validate all required fields
    if (
      !pillA?.time || !pillB?.time ||
      typeof pillA?.quantity !== 'number' ||
      typeof pillB?.quantity !== 'number' ||
      typeof cntA !== 'number' || 
      typeof cntB !== 'number'
    ) {
      return res.status(400).json({ error: 'Invalid request format' });
    }

    await pool.query('BEGIN');
    
    // Clear existing data
    await pool.query('TRUNCATE medications');
    
    // Insert new data with proper count separation
    await pool.query(
      `INSERT INTO medications (name, time, quantity, cnt_b)
       VALUES
         ($1, $2, $3, $4), 
         ($5, $6, $7, $8)`,
      [
        // Pill A entry
        'A', 
        parseTime(pillA.time), 
        pillA.quantity,
        cntA,  // A pills count goes to cnt_a
        
        // Pill B entry
        'B', 
        parseTime(pillB.time), 
        pillB.quantity,
        cntB   // B pills count goes to cnt_b
      ]
    );

    await pool.query(`
      UPDATE attendance
      SET pill_a = false, 
          pill_b = false
      WHERE recorded_date = CURRENT_DATE
  `);
    
    await pool.query('COMMIT');
    res.json({ success: true });

  } catch (error) {
    await pool.query('ROLLBACK');
    console.error('Database Error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Database operation failed',
      details: error.message 
    });
  }
});


async function initializeCounts() {
  try {
    const { rows } = await pool.query(`
      SELECT name, cnt_b 
      FROM medications 
      WHERE name IN ('A', 'B')
    `);
    
    previousCounts = rows.reduce((acc, row) => {
      acc[row.name] = row.cnt_b;
      return acc;
    }, { A: null, B: null });
  } catch (error) {
    console.error('Initialization failed:', error);
  }
}

// Add to your existing endpoints
// Modified checkStockLevels function
async function checkStockLevels() {
  try {
    // Get current counts for both pills
    const { rows } = await pool.query(`
      SELECT name, cnt_b 
      FROM medications 
      WHERE name IN ('A', 'B')
    `);

    // Create lookup object { A: X, B: Y }
    const currentCounts = rows.reduce((acc, row) => {
      acc[row.name] = row.cnt_b;
      return acc;
    }, { A: null, B: null });

    // Check Pill A - only if it exists in results
    if (currentCounts.A !== undefined) {
      if (currentCounts.A <= 0 && previousCounts.A > 0) {
        await sendAlertSMS('A');
      }
    }

    // Check Pill B - only if it exists in results
    if (currentCounts.B !== undefined) {
      if (currentCounts.B <= 0 && previousCounts.B > 0) {
        await sendAlertSMS('B');
      }
    }

    // Update previous counts
    previousCounts = currentCounts;
  } catch (error) {
    console.error('Stock check error:', error);
  }
}






async function sendAlertSMS(pillName) {
  try {
    await twilioClient.messages.create({
      body: `Pill ${pillName} stock is exhausted`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: process.env.ALERT_PHONE_NUMBER
    });
    console.log(`Alert sent for pill ${pillName}`);
  } catch (error) {
    console.error(`SMS failed for ${pillName}:`, error);
  }
}


async function getCurrentSchedule() {
  try {
    const { rows } = await pool.query(`
      SELECT name, time 
      FROM medications 
      WHERE name IN ('A', 'B')
    `);
    
    return {
      A: rows.find(r => r.name === 'A')?.time,
      B: rows.find(r => r.name === 'B')?.time
    };
  } catch (error) {
    console.error('Schedule fetch failed:', error);
    return { A: null, B: null };
  }
}

async function checkMedicationTiming() {
  try {
    const schedule = await getCurrentSchedule();
    console.log('Fetched Schedule:', schedule);

    const checkPill = async (pillName) => {
      if (!schedule[pillName]) return;


      if (alertCooldown[pillName] && (now - alertCooldown[pillName]) < 60000) {
        console.log(`${pillName} alert in cooldown`);
        return;
      }
      // Parse scheduled time (HH:MM:SS format)
      const [hours, minutes] = schedule[pillName].split(':').map(Number);
      
      // Create scheduled time in IST (server timezone agnostic)
      const scheduledIST = new Date();
      scheduledIST.setHours(hours);
      scheduledIST.setMinutes(minutes);
      scheduledIST.setSeconds(0);

      // Calculate reminder time (scheduled time + 1 minute)
      const reminderTime = new Date(scheduledIST.getTime() + 60000); 

      // Current time in IST
      const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));



      // Check if current time is within ±15 seconds of reminder time
      const timeDiff = Math.abs(nowIST - reminderTime);
      if (timeDiff <= 15000) {
        console.log(`Time match for ${pillName} (±15s)`);
        const { rows } = await pool.query(`
          SELECT pill_${pillName.toLowerCase()} as taken 
          FROM attendance 
          WHERE recorded_date = CURRENT_DATE
        `);

        if (rows.length > 0 && !rows[0].taken) {
          console.log(`Triggering alert for ${pillName}`);
          await triggerVoiceAlert(pillName);
        }
      }
    };

    await checkPill('A');
    await checkPill('B');
  } catch (error) {
    console.error('Timing check failed:', error);
  }
}




app.post('/voice-alert', (req, res) => {
  const responseXml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Your parent has missed their medication! Please check immediately.</Say>
</Response>`;
  
  res.type('text/xml');
  res.send(responseXml);
});

// Update triggerVoiceAlert function
async function triggerVoiceAlert(pillName) {
  try {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Your parent has missed pill ${pillName}! Please check immediately.</Say>
</Response>`;

    await twilioClient.calls.create({
      twiml: twiml,
      to: process.env.ALERT_PHONE_NUMBER,
      from: process.env.TWILIO_PHONE_NUMBER
    });
    
    console.log(`Voice alert sent for pill ${pillName}`);
  } catch (error) {
    console.error(`Voice alert failed for ${pillName}:`, error);
  }
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`Server running on ${PORT}`);
  
  try {
    // Initialize previous counts
    await initializeCounts();
    setInterval(checkMedicationTiming, 30000);
    // Start continuous monitoring
    setInterval(checkStockLevels, 3000);

    // Initial immediate check
    await checkStockLevels(); 
  } catch (error) {
    console.error('Server startup error:', error);
  }
});
