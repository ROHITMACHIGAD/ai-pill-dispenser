

# AI Pill Dispenser: IoT Medication Monitoring and Alert System

## 📖 Project Title

**AI Pill Dispenser — Voice-Enabled IoT System for Automated Medication Management, Health Monitoring, and Proactive Alerts**

## 📝 Description

**AI Pill Dispenser** is a full-stack IoT solution designed to ensure elderly, chronically ill, or special-needs users can safely and reliably take their medication. The system combines ESP32-based hardware (for physical pill dispensing and biometric measurement) with modern cloud services (Python Flask and Node.js APIs, PostgreSQL database, Twilio and Deepgram for communications and speech), and a React-based, fully voice-driven web interface.

**Core objectives:**

- **Automate**: Dispense pills at scheduled times, confirm user interaction, and gather biometric data.
- **Monitor**: Log all activity, detect missed doses, and track inventory levels in real time.
- **Notify**: Instantly alert caregivers/family via calls or SMS when doses are missed or stocks run low.
- **Empower**: Enable users or their families to interact by voice—no typing or complex apps needed.

The result is a platform that increases safety, peace of mind, and independence for both users and their loved ones.

## 🚀 Features

### Hardware \& Device

- **Automated Pill Dispensing**
    - Dispenses two types (A, B) of medication at user-defined times using servo motors.
    - IR sensors confirm that users have actually retrieved their medication.
- **Biometric Health Measurement**
    - Pulse sensor integrated on the device: users place a finger to log BPM (beats per minute); data sent to backend in real-time for analysis.
- **Local Feedback**
    - Buzzer guidance at dispense times (beeps as alert/reminder).
    - Robust state handling: disables unnecessary measurement, supports emergency stops.


### Backend APIs \& Data

- **Flask Backend (Python)**
    - RESTful API for device communication: records BPMs, logs dosing events, provides schedule and inventory information.
    - Handles CORS, connects directly to PostgreSQL for durable storage.
- **Node.js Cloud Service**
    - Advanced logic:
        - Detects when a scheduled dose was missed.
        - Sends Twilio Voice call (“Your parent has missed pill X!”) to family/caregivers.
        - Sends SMS about low/exhausted stock.
        - Provides speech-to-text support via Deepgram for live voice commands, recorded logs, etc.
    - Runs scheduled checks and monitors all key events.
- **PostgreSQL Database**
    - Stores pill schedules, user attendance, BPM data, and inventory levels.


### Web \& User Interface

- **Fully Voice-Driven Web UI (React)**
    - All core setup tasks (pill loading, scheduling, feedback/report access) are performed via natural speech using the computer’s microphone.
    - Speech synthesized responses (configurable TTS voice).
    - Dedicated menu for health reports, pill details, and more.
- **Health Report Page**
    - Accessible as `health.html` via web/React menu: displays BPM logs and possibly adherence statistics, making history and trends visible to users or caregivers.


## 🛠️ Tech Stack

**Hardware:**

- ESP32 (Arduino core)
- Servo motors, pulse sensor, IR sensor(s), buzzer

**APIs \& Server:**

- **Python Flask** (REST API for device)
    - flask, flask-cors, psycopg2
- **Node.js/Express.js** (Monitoring, alerts, speech-to-text)
    - express, node-cron, dotenv, twilio, @deepgram/sdk, express-fileupload, cors, pg, axios

**Frontend:**

- React 18+ SPA (via react-scripts)
- Browser Speech Synthesis API
- Custom audio recording logic posting audio to `/stt` endpoint (uses Deepgram backend for STT)
- CSS modules for styling

**Database:**

- PostgreSQL (local or hosted)
    - medications, bpm, attendance tables as schema backbone

**Cloud Services:**

- **Twilio**: Programmable Voice and SMS
- **Deepgram**: Speech-to-text (backend for audio commands)


## 🏗️ Installation Instructions

### 1. **Hardware Setup**

- Assemble ESP32 on breadboard/PCB:
    - Connect two servos for Pill A/B
    - Attach IR sensors (one for dispensing slot, one for trigger)
    - Add pulse sensor and buzzer as per supplied wiring in Arduino code
- Load provided Arduino sketch in [arduino-firmware/] to the board
- Set your WiFi credentials (`ssid`, `password`, and backend IPs) in the firmware before flashing


### 2. **Database Setup**

- Install PostgreSQL (local or cloud host)
- Create a database (e.g., `medtracker`)
- (Manually) create three core tables based on intended usage:
    - **medications(name, time, quantity, cnt_a, cnt_b, created_at)**
    - **attendance(recorded_date, pill_a, pill_b)**
    - **bpm(bpm, recorded_at)**
- [Optionally] Provide example schema in a `/db` folder


### 3. **Python Flask Backend**

- Go to your Flask backend directory:

```sh
cd flask-backend/
pip install flask flask-cors psycopg2
```

- Adjust the `get_db_connection()` settings in `app.py` to match your DB host/credentials.
- Start the server (default: `0.0.0.0:5001`):

```sh
python app.py
```


### 4. **Node.js Backend: Monitoring, Alerts, Speech-to-Text**

- Go to Node backend:

```sh
cd node-backend/
npm install
```

- Copy and configure `.env` from `.env.example`:

```
DB_USER=postgres
DB_PASSWORD=yourpassword
DB_HOST=localhost
DB_PORT=5432
DB_NAME=medtracker
DB_SSL=false

TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=...  # Twilio-provisioned
ALERT_PHONE_NUMBER=...   # Caregiver's phone
DEEPGRAM_API_KEY=...
PORT=5000
```

- Launch the backend:

```sh
npm run dev
# or node index.js
```

- This server should run continuously—it powers `/store`, `/stt`, and all alerting logic.


### 5. **React Frontend Setup**

- Go to your frontend directory (created with Create React App or compatible with above index.js/App.js structure):

```sh
cd frontend/
npm install
npm start
```

- Make sure `VoiceInterface.js`, `App.js`, and other UI files are present. Place static pages like `health.html` in `/public` or your hosting static folder.
- **Permissions**: The web app will ask for microphone access—grant it for speech/command input!


### 6. **health.html and Other Static Pages**

- Place `health.html` (and other dashboard/pill pages) in the appropriate location (`/frontend/public/health.html` if using Create React App).
- Confirm REST API endpoints used by this page match your deployment.


### 7. **ESP32 Firmware Flashing**

- Using Arduino IDE:
    - Load and configure the provided .ino file.
    - Set hardware pin numbers, WiFi credentials, and backend URLs as suits your network.
    - Upload and power on; monitor via Serial for debug logs.


### 8. **Order of Startup**

**Start services in this order:**

1. PostgreSQL database
2. Flask backend
3. Node.js backend
4. React frontend (`localhost:3000`)
5. Power up the ESP32 device

### 9. **First-Time Use (Voice User Workflow Example)**

- Open the React web UI in a browser
- On first use, follow synthesized voice prompts:
    - E.g., say: “I inserted three A pills and five B pills.”
    - Then: “Take A at 8 AM with two pills and B at 7 PM with three pills.”
- App handles parsing, scheduling, and posts config to backend
- Use menu (hamburger icon ☰) to access health or inventory reports


## ⚡ Additional Notes \& FAQ

- **Security**: Never commit `.env` with real credentials!
- **Deployment**: For production, consider Docker, SSL, proper reverse proxying, and user authentication.
- **Voice UI**: Supports most desktop browsers. On mobile, audio recording support may vary.


## 🤝 Credits

- **Twilio** for instant SMS/voice notifications
- **Deepgram** for speech recognition
- **ESP32/Arduino**, **Flask**, **Express.js**, **React**, **PostgreSQL** communities


## 📄 License

MIT (or your preferred open-source license)

**For questions, enhancements, or deploying to the cloud, open an issue or submit a pull request!**

**Ready to revolutionize medication adherence and health tracking with IoT and AI.** 🚀


