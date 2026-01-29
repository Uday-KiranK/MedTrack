exports.uploadLabReport = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    res.status(200).json({
      message: "Lab report uploaded successfully",
      fileId: req.file.filename,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
