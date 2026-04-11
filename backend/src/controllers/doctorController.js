const { findUserByPhone, linkPatientToDoctor, getDoctorPatients } = require("../models/userModel");

exports.addPatientByPhone = async (req, res) => {
  try {
    const { phone } = req.body;
    const doctorId = req.user.id;

    if (!phone) {
      return res.status(400).json({ message: "Phone number is required" });
    }

    const patient = await findUserByPhone(phone);
    if (!patient) {
      return res.status(404).json({ message: "No user found with this phone number" });
    }

    if (patient.role !== "patient") {
      return res.status(400).json({ message: "User is not registered as a patient" });
    }

    const linked = await linkPatientToDoctor(doctorId, patient.id);
    if (!linked) {
      return res.status(400).json({ message: "Patient is already added to your list" });
    }

    res.status(201).json({ message: "Patient added successfully", patient: { id: patient.id, name: patient.name, phone: patient.phone } });
  } catch (error) {
    console.error("Add patient error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

exports.getMyPatients = async (req, res) => {
  try {
    const doctorId = req.user.id;
    const patients = await getDoctorPatients(doctorId);
    res.json(patients);
  } catch (error) {
    console.error("Get patients error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
