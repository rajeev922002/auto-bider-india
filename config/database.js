const mongoose = require("mongoose")
exports.connect = ()=>{
    // mongoose.connect('mongodb://127.0.0.1:27017/smarthrm', {useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: false });
    mongoose.connect('mongodb://127.0.0.1:27017/autobids', {useNewUrlParser: true, useUnifiedTopology: true});
    
    
    const db = mongoose.connection;
    db.on('error', console.error.bind(console, 'connection error:'));
    db.once('open', function() {
      console.log("connected")
    });
}