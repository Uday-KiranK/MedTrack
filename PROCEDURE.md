# MedTrack: Project Setup, Architecture & Submission Procedure

**Repository**: [https://github.com/Uday-KiranK/MedTrack.git](https://github.com/Uday-KiranK/MedTrack.git)  
**Academic Year**: 2023–2024 / 2026  
**Institution**: Indian Institute of Information Technology Dharwad (IIIT Dharwad)  
**Department**: Computer Science and Engineering  
**Project Supervisor**: Dr. Sunil C.K, Assistant Professor  

### Project Team Members
1. **K. Uday Kiran** (Roll No: `23BCS072`) — *Project Lead & System Architect*
2. **M. Raju** (Roll No: `23BCS076`) — *Front-Desk & Clinical Operations Engineer*
3. **M. Rajesh** (Roll No: `23BCS077`) — *Pharmacy Management & Fulfillment Engineer*
4. **P. Shasank Pavan** (Roll No: `23BCS096`) — *Patient Mobile Experience, AI & Native Audio Lead*

---

## 1. System Architecture & Tech Stack

- **Mobile Frontend**: React Native, Expo SDK 58, `expo-audio`, `@react-navigation/native-stack`, `i18next`, `@react-native-picker/picker`, `react-native-safe-area-context`.
- **Backend API**: Node.js, Express, `pg` (PostgreSQL client), `bcrypt`, `jsonwebtoken`, `multer`, `pdf-parse`, `tesseract.js`.
- **Database**: Cloud PostgreSQL on Neon (`ep-little-scene-aoth34lv-pooler...`), supporting relational schemas, foreign keys, row-level locking (`FOR UPDATE`), and JSONB vitals storage.
- **AI & Vernacular Services**:
  - **OpenRouter** (`meta-llama/llama-3.3-70b-instruct:online`) with **Groq** (`openai/gpt-oss-120b`) fallback for live pharmacology search.
  - **Sarvam AI** (`https://api.sarvam.ai/translate`) for Indic vernacular translation across Hindi, Tamil, Telugu, and Kannada.
- **Cloud Deployments**:
  - **Backend API**: Deployed on Render Cloud (`https://medtrack-6r6b.onrender.com/api`).
  - **Mobile Standalone APK**: Compiled via Expo EAS Cloud Build (`v3.0.0`, SDK 58).

---

## 2. Direct Downloads & Links

- **GitHub Repository**: [https://github.com/Uday-KiranK/MedTrack.git](https://github.com/Uday-KiranK/MedTrack.git)
- **Standalone Android APK (v3.0.0)**: [Download APK](https://expo.dev/artifacts/eas/g5P98gMWPMRD_kr0pAJB7TFjpPt3w_81UY575MizgUo.apk)
- **Expo EAS Build & QR Code**: [Expo Build Dashboard](https://expo.dev/accounts/udaykirank/projects/medtrack/builds/253b6f71-8172-43e7-88da-6e241152ea0e)
- **Project Report (PDF)**: `MedTrack_Mini_Project_Report_Submission.pdf`

---

## 3. Step-by-Step Installation & Execution Procedure

### Step 3.1: Prerequisites
- Node.js version 20 or 22 LTS
- Git
- Android device or Android Studio Emulator (or Expo Go app on mobile)

### Step 3.2: Clone Repository
```bash
git clone https://github.com/Uday-KiranK/MedTrack.git
cd MedTrack
```

### Step 3.3: Backend Setup
```bash
cd backend
npm install
```
Create or verify `backend/.env` with:
```env
PORT=5000
DATABASE_URL=postgresql://neondb_owner:npg_gY5y3rSbtlPj@ep-little-scene-aoth34lv-pooler.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
JWT_SECRET=supersecretjwtkeymedtrack2026
SUPERADMIN_EMAIL=admin@medtrack.app
SUPERADMIN_PASSWORD=Admin@123
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=your_twilio_phone
OPENROUTER_API_KEY=your_openrouter_key
GROQ_API_KEY=your_groq_key
SARVAM_API_KEY=your_sarvam_key
```
Start backend server:
```bash
npm start
```
*The backend boot process runs `initV3Schema()` idempotently, creating and validating all tables and indexes.*

### Step 3.4: Frontend Setup
```bash
cd ../frontend
npm install
```
Start frontend development bundler:
```bash
npx expo start
```
- Press `a` for Android emulator, or scan the terminal QR code using **Expo Go** on an Android phone.
- Or install the standalone compiled APK directly on your device via the link above.

---

## 4. Default Demonstration & Evaluation Credentials

Organization Code: **`MEDTRACK01`**

| Role | Email / Username | Password | Purpose |
|---|---|---|---|
| **Admin** | `admin@medtrack.app` | `Admin@123` | Staff approval, roles/permissions, clinic analytics |
| **Doctor** | `doctor.alpha@medtrack.app` *(or self-registered)* | `Password123!` | Consultations, CheckUps, stock browser, Rx writing |
| **Receptionist** | `reception@medtrack.app` *(or self-registered)* | `Password123!` | Weekly schedules, calendar blocks, triage, walk-ins |
| **Pharmacy Mgr** | `pharmacy@medtrack.app` *(or self-registered)* | `Password123!` | Inventory CRUD, restock, dispense queue, invoices |
| **Patient** | Phone registration / OTP | Universal OTP `1234` | Adherence alarms, clinic visits, vernacular advice |

*Note: For testing phone OTP logins or staff signups without carrier SMS latency, universal test code **`1234`** is enabled.*

---

## 5. Automated Verification & Testing
To execute the comprehensive 9-section end-to-end integration and boundary test suite:
```bash
node scratch/rigorous_e2e_suite.js
```
Expected output:
```
=================================================================
ALL RIGOROUS COMPREHENSIVE TESTS PASSED WITH ZERO ERRORS!
=================================================================
```
