const mongoose = require('mongoose');

const connectDB = async () => {
  if (mongoose.connection.readyState >= 1) return;
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, { dbName: 'wheno' });
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    throw err;
  }
};

module.exports = connectDB;
