const app = require("./app");
const { connectDB } = require("./config/db");
const { PORT } = require("./config/env");

connectDB();

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Recurring transactions: generate due occurrences for all users at startup, then every hour.
// Lives here (not in app.js) so tests never start timers. Disable with RECURRING_SCHEDULER=off.
if (process.env.RECURRING_SCHEDULER !== "off") {
  require("./services/recurringService").startScheduler();
}
