/*
var mongoose = require('mongoose');
var Schema=mongoose.Schema;
var training_data=new Schema({
    p1	:	Number	,
    p2	:	Number	,
    p3	:	Number	,
    p4	:	Number	,
    p5	:	Number	,
    p6	:	Number	,
    p7	:	Number	,
    p8	:	Number	,
    p9	:	Number	,
    p10	:	Number	,
    p11	:	Number	,
    p12	:	Number	,
    p13	:	Number	,
    p14	:	Number	,
    p15	:	Number	,
    p16	:	Number	,
    p17	:	Number	,
    p18	:	Number	,
    p19	:	Number	,
    p20	:	Number	,
    p21	:	Number	,
    p22	:	Number	,
    p23	:	Number	,
    p24	:	Number	,
    p25	:	Number	,
    p26	:	Number	,
    p27	:	Number	,
    p28	:	Number	,
    p29	:	Number	,
    p30	:	Number	
});

var target_data=new Schema({
    g1	:	Number	,
    g2	:	Number	,
    g3	:	Number	
});

mongoose.model( 'training_data', training_data );
mongoose.model( 'target_data', target_data );
//mongoose.connect( 'mongodb://140.116.234.174:20117/brain' );
mongoose.connect('mongodb://autolab:auto63906@140.116.234.174:20117/brain');
*/
var mongoose = require('mongoose');
var Schema=mongoose.Schema;
var device_list=new Schema({
	device_name			: String,
	device_ip			: String,
	device_type 		: String,
	device_last_login	: Date
});

mongoose.model( 'devices', device_list );
mongoose.connect( 'mongodb://140.116.234.174:20117/db_ServiceBroker' );