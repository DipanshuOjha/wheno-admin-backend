const app = require('./app');

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Wheno Admin Backend running on port ${PORT}`);
});
