require("dotenv").config();
require("./utils/db");
const { initV3Schema } = require("./utils/initV3Schema");
require("./scheduler/reminderScheduler");
const app = require("./app");

const PORT = process.env.PORT || 5000;

initV3Schema()
  .catch((err) => {
    console.error("Initial V3 schema error:", err.message);
  })
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);

      // Warm up medicine info cache for existing prescribed medicines
      setTimeout(async () => {
        try {
          const pool = require("./utils/db");
          const { precacheMedicineInfoAllLangs } = require("./services/medicineInfoService");
          const res = await pool.query("SELECT DISTINCT medicine_name, medicine_form, dosage FROM medicines LIMIT 20");
          for (const row of res.rows) {
            if (row.medicine_name) {
              await precacheMedicineInfoAllLangs(row.medicine_name, row.medicine_form || 'Tablet', row.dosage || '');
            }
          }
        } catch (err) {
          console.log("Warmup notice:", err.message);
        }
      }, 2000);
    });
  });
