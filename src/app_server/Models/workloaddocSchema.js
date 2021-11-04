var mongoose = require( 'mongoose' );

//subdocument
var workloaddocSchema = new mongoose.Schema({
    lparname: {type: String, required: true},
    title: {type: String, required: true},
    datetime: {type: Date, required: true},
    Caption: {type: Array, required: true},
    Class: {type: Array, required: true}
});



module.exports.wokloaddocs = mongoose.model('WorkloadActivity', workloaddocSchema);