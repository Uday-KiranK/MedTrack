require("dotenv").config();
require("./utils/db"); 
require("./scheduler/reminderScheduler");
const app = require("./app");

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
