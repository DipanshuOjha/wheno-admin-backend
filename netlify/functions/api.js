const serverless = require('serverless-http');
const connectDB = require('../../config/db');
const app = require('../../app');

const handler = serverless(app);

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  await connectDB();
  return handler(event, context);
};
