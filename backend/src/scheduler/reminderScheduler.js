const cron = require("node-cron");
const pool = require("../utils/db");
const resolveTimes = require("../utils/resolveTimes");

cron.schedule("* * * * *", async () => {
  const now = new Date();
  const currentTime = now.toTimeString().slice(0, 5); // LOCAL TIME

  const res = await pool.query(
    "SELECT m.*, p.patient_id FROM medicines m JOIN prescriptions p ON p.id = m.prescription_id"
  );

  for (const med of res.rows) {
    const times = resolveTimes(med);

    if (times.includes(currentTime)) {
      // console.log(`🔔 Reminder: Take ${med.medicine_name}`);
      // Disabled backend spam: App handles alarms via PatientDashboard.js internally now.
    }
  }
});
