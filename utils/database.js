const mongoose = require('mongoose')

const mongoUri = "mongodb://kononov:291091@127.0.0.1:27017/ett-1155-db?authSource=admin"

const database = async () => await mongoose
  .connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log('Connected to Mongoose to ' + mongoUri))
  .catch((error) => console.log(error))
module.exports = database