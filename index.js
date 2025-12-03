'use strict';

// get the env variables
require('dotenv').config();

// require all dependencies
const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const promotionRoutes = require("./routes/promotions");
const eventRoutes = require("./routes/events");
const transactionRoutes = require("./routes/transactions");
const errorHandler = require("./middleware/errorHandler");

// get port
const port = process.env.PORT || 3001;

// get allowed origins for CORS
const frontend_url = process.env.FRONTEND_URL || "http://localhost:3000";

const app = express();

app.use(
  cors({
    origin: frontend_url,
    credentials: true,
  })
);
app.use(express.json());
app.use("/uploads", express.static("uploads"));
app.use("/auth", authRoutes);
app.use("/users", userRoutes);
app.use("/promotions", promotionRoutes);
app.use("/events", eventRoutes);
app.use("/transactions", transactionRoutes);

app.use(errorHandler);

// start app
const server = app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});

server.on('error', (err) => {
    console.error(`cannot start server: ${err.message}`);
    process.exit(1);
});
