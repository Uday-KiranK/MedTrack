const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/authRoutes");
const authenticate = require("./middleware/authMiddleware");
const authorizeRole = require("./middleware/roleMiddleware");
const prescriptionRoutes = require("./routes/prescriptionRoutes");
const labRoutes = require("./routes/labRoutes");

const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/prescriptions", prescriptionRoutes);
app.use("/api/labs", labRoutes);

app.get("/", (req, res) => {
  res.send("MedTrack Backend Running");
});
app.get("/api/protected", authenticate, (req, res) => {
  res.json({
    message: "Access granted",
    user: req.user,
  });
});
app.get(
  "/api/doctor-only",
  authenticate,
  authorizeRole("doctor"),
  (req, res) => {
    res.json({ message: "Doctor access granted" });
  }
);


module.exports = app;
