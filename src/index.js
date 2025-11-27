const connectDB = require('./config/db');
const app = require('./app');
const { startOrderSyncCronJob } = require('./cron/syncOrdersCron');

// Connect to MongoDB and then start server
connectDB();

const PORT = process.env.PORT || 4001;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  startOrderSyncCronJob(); // Start the cron job when the server starts
});
