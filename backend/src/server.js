const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
require("dotenv").config();

const { connectDB } = require("./config/db");

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// Database Connection
connectDB();

// Routes
app.use("/api/auth", require("./routes/authRoutes"));

app.get("/api/health", (req, res) => {
  res
    .status(200)
    .json({ status: "OK", message: "FlyWallets Backend is Running 🚀" });
});

app.get("/", (req, res) => {
  res.send("FlyWallets API v1.0");
});

// Error Handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ status: "error", message: "Internal Server Error" });
});

// Server Start
const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
