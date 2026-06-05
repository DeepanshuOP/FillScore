const mongoose = require('mongoose');
mongoose.connect('mongodb://localhost:27017/fillscore').then(() => 
    mongoose.connection.db.collection('trades').aggregate([
        { $match: { userId: 'demo-aggressive' } }, 
        { $group: { _id: { $hour: '$executedAt' }, count: { $sum: 1 }, avgScore: { $avg: '$fillScore' } } }, 
        { $sort: { _id: 1 } }
    ]).toArray()
).then(console.log).then(() => process.exit(0));
