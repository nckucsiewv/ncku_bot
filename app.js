
const 
  bodyParser = require('body-parser'),
  config = require('config'),
  crypto = require('crypto'),
  express = require('express'),
  https = require('https'),  
  request = require('request');


// Retrieve
var MongoClient = require('mongodb').MongoClient;
   
//require('./lib/db_mongo');  ************************************************
//var mongoose = require('mongoose');  ************** ************************     
var brain=require("brain");
//var training_data_model = mongoose.model('training_data');
//var target_data_model = mongoose.model('target_data');
//var device_list_model = mongoose.model('devices');  **************************
//You can set the number and size of your hidden layers,
var net =new brain.NeuralNetwork(
    {
      /*  hiddenLayers
      *   Specify the number of hidden layers in the network 
      *   two hidden layers - the first with 3 nodes and 
      *   the second with 4 nodes:
      */
      hiddenLayers: [5,3],
      //   global learning rate, useful when training using streams
      learningRate: 0.78
    }
  ); 

//quickReply
var count_team ;
//receivedPostback
var subscription_team;
//宣告隊伍對應代號
var team_list = {
	A:"藥學",
	B:"會計",
	C:"電機",
	D:"材料",
	E:"資訊",
	F:"化工",
	G:"醫學",
	H:"法律",
	I:"歷史",
	J:"航太",
	K:"土木",
	L:"建築",
	M:"經濟",
	N:"工資管",
	O:"工設",
	P:"水利",
	
}
var court_list= {
	1:"光復四場",
	2:"光復五場",
	3:"光復高場東",
	
}

var app = express();
app.set('port', process.env.PORT || 5000);
app.set('view engine', 'ejs');
app.use(bodyParser.json({ verify: verifyRequestSignature }));
app.use(express.static('public'));


/*
 * Be sure to setup your config values before running this code. You can 
 * set them using environment variables or modifying the config file in /config.
 *
 */

// App Secret can be retrieved from the App Dashboard
const APP_SECRET = (process.env.MESSENGER_APP_SECRET) ? 
  process.env.MESSENGER_APP_SECRET :
  config.get('appSecret');

// Arbitrary value used to validate a webhook
const VALIDATION_TOKEN = (process.env.MESSENGER_VALIDATION_TOKEN) ?
  (process.env.MESSENGER_VALIDATION_TOKEN) :
  config.get('validationToken');

// Generate a page access token for your page from the App Dashboard
const PAGE_ACCESS_TOKEN = (process.env.MESSENGER_PAGE_ACCESS_TOKEN) ?
  (process.env.MESSENGER_PAGE_ACCESS_TOKEN) :
  config.get('pageAccessToken');

// URL where the app is running (include protocol). Used to point to scripts and 
// assets located at this address. 
const SERVER_URL = (process.env.SERVER_URL) ?
  (process.env.SERVER_URL) :
  config.get('serverURL');

if (!(APP_SECRET && VALIDATION_TOKEN && PAGE_ACCESS_TOKEN && SERVER_URL)) {
  console.error("Missing config values");
  process.exit(1);
}

/*
 * Use your own validation token. Check that the token used in the Webhook 
 * setup is the same token used here.
 *
 */
app.get('/webhook', function(req, res) {
  if (req.query['hub.mode'] === 'subscribe' &&
      req.query['hub.verify_token'] === VALIDATION_TOKEN) {
    console.log("Validating webhook");
    res.status(200).send(req.query['hub.challenge']);
  } else {
    console.error("Failed validation. Make sure the validation tokens match.");
    res.sendStatus(403);          
  }  
});


/*
 * All callbacks for Messenger are POST-ed. They will be sent to the same
 * webhook. Be sure to subscribe your app to your page to receive callbacks
 * for your page. 
 * https://developers.facebook.com/docs/messenger-platform/product-overview/setup#subscribe_app
 *
 */
app.post('/webhook', function (req, res) {
  var data = req.body;

  // Make sure this is a page subscription
  if (data.object == 'page') {
    // Iterate over each entry
    // There may be multiple if batched
    data.entry.forEach(function(pageEntry) {
      var pageID = pageEntry.id;
      var timeOfEvent = pageEntry.time;

      // Iterate over each messaging event
      pageEntry.messaging.forEach(function(messagingEvent) {
        if (messagingEvent.optin) {
          receivedAuthentication(messagingEvent);
        } else if (messagingEvent.message) {
          receivedMessage(messagingEvent);
        } else if (messagingEvent.delivery) {
          receivedDeliveryConfirmation(messagingEvent);
        } else if (messagingEvent.postback) {
          receivedPostback(messagingEvent);
        } else if (messagingEvent.read) {
          receivedMessageRead(messagingEvent);
        } else if (messagingEvent.account_linking) {
          receivedAccountLink(messagingEvent);
        } else {
          console.log("Webhook received unknown messagingEvent: ", messagingEvent);
        }
      });
    });

    // Assume all went well.
    //
    // You must send back a 200, within 20 seconds, to let us know you've 
    // successfully received the callback. Otherwise, the request will time out.
    res.sendStatus(200);
  }
});

/*
 * This path is used for account linking. The account linking call-to-action
 * (sendAccountLinking) is pointed to this URL. 
 * 
 */
app.get('/authorize', function(req, res) {
  var accountLinkingToken = req.query.account_linking_token;
  var redirectURI = req.query.redirect_uri;

  // Authorization Code should be generated per user by the developer. This will 
  // be passed to the Account Linking callback.
  var authCode = "1234567890";

  // Redirect users to this URI on successful login
  var redirectURISuccess = redirectURI + "&authorization_code=" + authCode;

  res.render('authorize', {
    accountLinkingToken: accountLinkingToken,
    redirectURI: redirectURI,
    redirectURISuccess: redirectURISuccess
  });
});

/*
 * Verify that the callback came from Facebook. Using the App Secret from 
 * the App Dashboard, we can verify the signature that is sent with each 
 * callback in the x-hub-signature field, located in the header.
 *
 * https://developers.facebook.com/docs/graph-api/webhooks#setup
 *
 */
function verifyRequestSignature(req, res, buf) {
  var signature = req.headers["x-hub-signature"];

  if (!signature) {
    // For testing, let's log an error. In production, you should throw an 
    // error.
    console.error("Couldn't validate the signature.");
  } else {
    var elements = signature.split('=');
    var method = elements[0];
    var signatureHash = elements[1];

    var expectedHash = crypto.createHmac('sha1', APP_SECRET)
                        .update(buf)
                        .digest('hex');

    if (signatureHash != expectedHash) {
      throw new Error("Couldn't validate the request signature.");
    }
  }
}

function receivedAuthentication(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfAuth = event.timestamp;

  // The 'ref' field is set in the 'Send to Messenger' plugin, in the 'data-ref'
  // The developer can set this to an arbitrary value to associate the 
  // authentication callback with the 'Send to Messenger' click event. This is
  // a way to do account linking when the user clicks the 'Send to Messenger' 
  // plugin.
  var passThroughParam = event.optin.ref;

  console.log("Received authentication for user %d and page %d with pass " +
    "through param '%s' at %d", senderID, recipientID, passThroughParam, 
    timeOfAuth);

  // When an authentication is received, we'll send a message back to the sender
  // to let them know it was successful.
  sendTextMessage(senderID, "Authentication successful");
}
   
function receivedMessage(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfMessage = event.timestamp;
  var message = event.message;
   console.log("Received message for user %d and page %d at %d with message:", 
    senderID, recipientID, timeOfMessage);
  console.log(JSON.stringify(message));

  var isEcho = message.is_echo;
  var messageId = message.mid;
  var appId = message.app_id;
  var metadata = message.metadata;

  // You may get a text or attachment but not both
  var messageText = message.text;
  var messageAttachments = message.attachments;
  var quickReply = message.quick_reply;
   /* if (messageText=="how are you"){
      sendTextMessage(senderID, "I'm fine.");
      return;
    }else{
		
	}
  //sendTextMessage(senderID,messageText);   //回傳使用者所打的文字
  sendTextMessage(senderID, getAnswer(messageText,event));  //進入到answer function
  return;*/
	
 
  if (isEcho) {
    // Just logging message echoes to console
     
    console.log("Received echo for message %s and app %d with metadata %s", 
      messageId, appId, metadata);
    return;
  } else if (quickReply) {
    var quickReplyPayload = quickReply.payload;
    console.log("Quick reply for message %s with payload %s",
      messageId, quickReplyPayload);
    //sendTextMessage(senderID, "Quick reply tapped");
		if(quickReplyPayload == "QuickReply_A"){
			sendQuickReply_A(senderID);
		}
		if(quickReplyPayload == "QuickReply_B"){
			sendQuickReply_B(senderID);
		}
		if(quickReplyPayload == "QuickReply_C"){
			sendQuickReply_C(senderID);
		}
		
		if(quickReplyPayload == "subscription_csie"){
			
		MongoClient.connect("mongodb://140.116.245.243:27017/NCKUVB", function(err, db) {
			
			if(!err) {
				console.log("We are connected mongodb");
				db.collection('subscription',function(err,collection){
					collection.find({User_id:senderID}).toArray(function(err,items){
						if(err) throw err;
						console.log(items);
						console.log("We found "+items.length+" results!");
						count_team=items.length;
						console.log(count_team);
					if(count_team==0){
						res = collection.insert({ User_id:senderID,Name:'E' });
						console.log(res);
					}else{
							
						collection.update({ User_id:senderID},{$set:{Name:'E' }});
						
					}
					db.close(); //關閉連線
					});//查詢
				
				});		
			}
		});
		sendTextMessage(senderID, "訂閱資訊成功囉^0^");
		sendHiButtonMessage(senderID);
		}
		
		if(quickReplyPayload == "subscription_ee"){
			
		MongoClient.connect("mongodb://140.116.245.243:27017/NCKUVB", function(err, db) {
			
			if(!err) {
				console.log("We are connected mongodb");
				db.collection('subscription',function(err,collection){
					collection.find({User_id:senderID}).toArray(function(err,items){
						if(err) throw err;
						console.log(items);
						console.log("We found "+items.length+" results!");
						count_team=items.length;
						console.log(count_team);
					if(count_team==0){
						res = collection.insert({ User_id:senderID,Name:'C' });
						console.log(res);
					}else{
							
						collection.update({ User_id:senderID},{$set:{Name:'C' }});
						
					}
					db.close(); //關閉連線
					});//查詢
				
				});
		
			}
		});
		sendTextMessage(senderID, "訂閱電機成功囉^0^");
		sendHiButtonMessage(senderID);
		}
		
		if(quickReplyPayload == "subscription_civil"){
			
		MongoClient.connect("mongodb://140.116.245.243:27017/NCKUVB", function(err, db) {
			
			if(!err) {
				console.log("We are connected mongodb");
				db.collection('subscription',function(err,collection){
					collection.find({User_id:senderID}).toArray(function(err,items){
						if(err) throw err;
						console.log(items);
						console.log("We found "+items.length+" results!");
						count_team=items.length;
						console.log(count_team);
					if(count_team==0){
						res = collection.insert({ User_id:senderID,Name:'K' });
						console.log(res);
					}else{
							
						collection.update({ User_id:senderID},{$set:{Name:'K' }});
						
					}
					db.close(); //關閉連線
					});//查詢
				
				});
		
			}
		});
		sendTextMessage(senderID, "訂閱土木成功囉^0^");
		sendHiButtonMessage(senderID);
		}
		
		
		if(quickReplyPayload == "subscription_che"){
			
		MongoClient.connect("mongodb://140.116.245.243:27017/NCKUVB", function(err, db) {
			
			if(!err) {
				console.log("We are connected mongodb");
				db.collection('subscription',function(err,collection){
					collection.find({User_id:senderID}).toArray(function(err,items){
						if(err) throw err;
						console.log(items);
						console.log("We found "+items.length+" results!");
						count_team=items.length;
						console.log(count_team);
					if(count_team==0){
						res = collection.insert({ User_id:senderID,Name:'F' });
						console.log(res);
					}else{
							
						collection.update({ User_id:senderID},{$set:{Name:'F' }});
						
					}
					db.close(); //關閉連線
					});//查詢
				
				});
		
			}
		});
		sendTextMessage(senderID, "訂閱化工成功囉^0^");
		sendHiButtonMessage(senderID);
		}

		if(quickReplyPayload == "subscription_law"){
			
		MongoClient.connect("mongodb://140.116.245.243:27017/NCKUVB", function(err, db) {
			
			if(!err) {
				console.log("We are connected mongodb");
				db.collection('subscription',function(err,collection){
					collection.find({User_id:senderID}).toArray(function(err,items){
						if(err) throw err;
						console.log(items);
						console.log("We found "+items.length+" results!");
						count_team=items.length;
						console.log(count_team);
					if(count_team==0){
						res = collection.insert({ User_id:senderID,Name:'H' });
						console.log(res);
					}else{
							
						collection.update({ User_id:senderID},{$set:{Name:'H' }});
						
					}
					db.close(); //關閉連線
					});//查詢
				
				});
		
			}
		});
		sendTextMessage(senderID, "訂閱法律成功囉^0^");
		sendHiButtonMessage(senderID);
		}
		
		if(quickReplyPayload == "subscription_arch"){
			
		MongoClient.connect("mongodb://140.116.245.243:27017/NCKUVB", function(err, db) {
			
			if(!err) {
				console.log("We are connected mongodb");
				db.collection('subscription',function(err,collection){
					collection.find({User_id:senderID}).toArray(function(err,items){
						if(err) throw err;
						console.log(items);
						console.log("We found "+items.length+" results!");
						count_team=items.length;
						console.log(count_team);
					if(count_team==0){
						res = collection.insert({ User_id:senderID,Name:'L' });
						console.log(res);
					}else{
							
						collection.update({ User_id:senderID},{$set:{Name:'L' }});
						
					}
					db.close(); //關閉連線
					});//查詢
				
				});
		
			}
		});
		sendTextMessage(senderID, "訂閱建築成功囉^0^");
		sendHiButtonMessage(senderID);
		}
		
		if(quickReplyPayload == "subscription_iim"){
			
		MongoClient.connect("mongodb://140.116.245.243:27017/NCKUVB", function(err, db) {
			
			if(!err) {
				console.log("We are connected mongodb");
				db.collection('subscription',function(err,collection){
					collection.find({User_id:senderID}).toArray(function(err,items){
						if(err) throw err;
						console.log(items);
						console.log("We found "+items.length+" results!");
						count_team=items.length;
						console.log(count_team);
					if(count_team==0){
						res = collection.insert({ User_id:senderID,Name:'N' });
						console.log(res);
					}else{
							
						collection.update({ User_id:senderID},{$set:{Name:'N' }});
						
					}
					db.close(); //關閉連線
					});//查詢
				
				});
		
			}
		});
		sendTextMessage(senderID, "訂閱工資管成功囉^0^");
		sendHiButtonMessage(senderID);
		}
		
		if(quickReplyPayload == "subscription_aa"){
			
		MongoClient.connect("mongodb://140.116.245.243:27017/NCKUVB", function(err, db) {
			
			if(!err) {
				console.log("We are connected mongodb");
				db.collection('subscription',function(err,collection){
					collection.find({User_id:senderID}).toArray(function(err,items){
						if(err) throw err;
						console.log(items);
						console.log("We found "+items.length+" results!");
						count_team=items.length;
						console.log(count_team);
					if(count_team==0){
						res = collection.insert({ User_id:senderID,Name:'J' });
						console.log(res);
					}else{
							
						collection.update({ User_id:senderID},{$set:{Name:'J' }});
						
					}
					db.close(); //關閉連線
					});//查詢
				
				});
		
			}
		});
		sendTextMessage(senderID, "訂閱航太成功囉^0^");
		sendHiButtonMessage(senderID);
		}
		
		if(quickReplyPayload == "subscription_mse"){
			
		MongoClient.connect("mongodb://140.116.245.243:27017/NCKUVB", function(err, db) {
			
			if(!err) {
				console.log("We are connected mongodb");
				db.collection('subscription',function(err,collection){
					collection.find({User_id:senderID}).toArray(function(err,items){
						if(err) throw err;
						console.log(items);
						console.log("We found "+items.length+" results!");
						count_team=items.length;
						console.log(count_team);
					if(count_team==0){
						res = collection.insert({ User_id:senderID,Name:'D' });
						console.log(res);
					}else{
							
						collection.update({ User_id:senderID},{$set:{Name:'D' }});
						
					}
					db.close(); //關閉連線
					});//查詢
				
				});
		
			}
		});
		sendTextMessage(senderID, "訂閱材料成功囉^0^");
		sendHiButtonMessage(senderID);
		}
		
		if(quickReplyPayload == "subscription_hyd"){
			
		MongoClient.connect("mongodb://140.116.245.243:27017/NCKUVB", function(err, db) {
			
			if(!err) {
				console.log("We are connected mongodb");
				db.collection('subscription',function(err,collection){
					collection.find({User_id:senderID}).toArray(function(err,items){
						if(err) throw err;
						console.log(items);
						console.log("We found "+items.length+" results!");
						count_team=items.length;
						console.log(count_team);
					if(count_team==0){
						res = collection.insert({ User_id:senderID,Name:'P' });
						console.log(res);
					}else{
							
						collection.update({ User_id:senderID},{$set:{Name:'P' }});
						
					}
					db.close(); //關閉連線
					});//查詢
				
				});
		
			}
		});
		sendTextMessage(senderID, "訂閱水利成功囉^0^");
		sendHiButtonMessage(senderID);
		}
		
		if(quickReplyPayload == "subscription_his"){
			
		MongoClient.connect("mongodb://140.116.245.243:27017/NCKUVB", function(err, db) {
			
			if(!err) {
				console.log("We are connected mongodb");
				db.collection('subscription',function(err,collection){
					collection.find({User_id:senderID}).toArray(function(err,items){
						if(err) throw err;
						console.log(items);
						console.log("We found "+items.length+" results!");
						count_team=items.length;
						console.log(count_team);
					if(count_team==0){
						res = collection.insert({ User_id:senderID,Name:'I' });
						console.log(res);
					}else{
							
						collection.update({ User_id:senderID},{$set:{Name:'I' }});
						
					}
					db.close(); //關閉連線
					});//查詢
				
				});
		
			}
		});
		sendTextMessage(senderID, "訂閱歷史成功囉^0^");
		sendHiButtonMessage(senderID);
		}
		
		if(quickReplyPayload == "subscription_acc"){
			
		MongoClient.connect("mongodb://140.116.245.243:27017/NCKUVB", function(err, db) {
			
			if(!err) {
				console.log("We are connected mongodb");
				db.collection('subscription',function(err,collection){
					collection.find({User_id:senderID}).toArray(function(err,items){
						if(err) throw err;
						console.log(items);
						console.log("We found "+items.length+" results!");
						count_team=items.length;
						console.log(count_team);
					if(count_team==0){
						res = collection.insert({ User_id:senderID,Name:'B' });
						console.log(res);
					}else{
							
						collection.update({ User_id:senderID},{$set:{Name:'B' }});
						
					}
					db.close(); //關閉連線
					});//查詢
				
				});
		
			}
		});
		sendTextMessage(senderID, "訂閱會計成功囉^0^");
		sendHiButtonMessage(senderID);
		}
		
		if(quickReplyPayload == "subscription_med"){
			
		MongoClient.connect("mongodb://140.116.245.243:27017/NCKUVB", function(err, db) {
			
			if(!err) {
				console.log("We are connected mongodb");
				db.collection('subscription',function(err,collection){
					collection.find({User_id:senderID}).toArray(function(err,items){
						if(err) throw err;
						console.log(items);
						console.log("We found "+items.length+" results!");
						count_team=items.length;
						console.log(count_team);
					if(count_team==0){
						res = collection.insert({ User_id:senderID,Name:'G' });
						console.log(res);
					}else{
							
						collection.update({ User_id:senderID},{$set:{Name:'G' }});
						
					}
					db.close(); //關閉連線
					});//查詢
				
				});
		
			}
		});
		sendTextMessage(senderID, "訂閱醫學成功囉^0^");
		sendHiButtonMessage(senderID);
		}
		
		if(quickReplyPayload == "subscription_id"){
			
		MongoClient.connect("mongodb://140.116.245.243:27017/NCKUVB", function(err, db) {
			
			if(!err) {
				console.log("We are connected mongodb");
				db.collection('subscription',function(err,collection){
					collection.find({User_id:senderID}).toArray(function(err,items){
						if(err) throw err;
						console.log(items);
						console.log("We found "+items.length+" results!");
						count_team=items.length;
						console.log(count_team);
					if(count_team==0){
						res = collection.insert({ User_id:senderID,Name:'O' });
						console.log(res);
					}else{
							
						collection.update({ User_id:senderID},{$set:{Name:'O' }});
						
					}
					db.close(); //關閉連線
					});//查詢
				
				});
		
			}
		});
		sendTextMessage(senderID, "訂閱工設成功囉^0^");
		sendHiButtonMessage(senderID);
		}
		
		if(quickReplyPayload == "subscription_phar"){
			
		MongoClient.connect("mongodb://140.116.245.243:27017/NCKUVB", function(err, db) {
			
			if(!err) {
				console.log("We are connected mongodb");
				db.collection('subscription',function(err,collection){
					collection.find({User_id:senderID}).toArray(function(err,items){
						if(err) throw err;
						console.log(items);
						console.log("We found "+items.length+" results!");
						count_team=items.length;
						console.log(count_team);
					if(count_team==0){
						res = collection.insert({ User_id:senderID,Name:'A' });
						console.log(res);
					}else{
							
						collection.update({ User_id:senderID},{$set:{Name:'A' }});
						
					}
					db.close(); //關閉連線
					});//查詢
				
				});
		
			}
		});
		sendTextMessage(senderID, "訂閱藥學成功囉^0^");
		sendHiButtonMessage(senderID);
		}
		
		if(quickReplyPayload == "subscription_eco"){
			
		MongoClient.connect("mongodb://140.116.245.243:27017/NCKUVB", function(err, db) {
			
			if(!err) {
				console.log("We are connected mongodb");
				db.collection('subscription',function(err,collection){
					collection.find({User_id:senderID}).toArray(function(err,items){
						if(err) throw err;
						console.log(items);
						console.log("We found "+items.length+" results!");
						count_team=items.length;
						console.log(count_team);
					if(count_team==0){
						res = collection.insert({ User_id:senderID,Name:'M' });
						console.log(res);
					}else{
							
						collection.update({ User_id:senderID},{$set:{Name:'M' }});
						
					}
					db.close(); //關閉連線
					});//查詢
				
				});
		
			}
		});
		sendTextMessage(senderID, "訂閱經濟成功囉^0^");
		sendHiButtonMessage(senderID);
		}
		
    return;
  }
  
  

  if (messageText) {
    
    // If we receive a text message, check to see if it matches any special
    // keywords and send back the corresponding example. Otherwise, just echo
    // the text we received.
    switch (messageText) {
      case '賽程':
        sendImageMessage(senderID);
        break;
	 
      case 'hi':
        sendHiButtonMessage(senderID);
        break;
		    
     case 'Hi':
        sendHiButtonMessage(senderID);
        break;

      case 'generic':
        sendGenericMessage(senderID);
        break;

      case 'quick reply':
        sendQuickReply(senderID);
        break;        
      case '資訊':
         //sendTimeTextMessage(senderID, messageText);
			 MongoClient.connect("mongodb://140.116.245.243:27017/NCKUVB", function(err, db) {
			
				if(!err) {
					console.log("We are connected mongodb");
					db.collection('match',function(err,collection){
												 
						collection.find({}).toArray(function(err,items){
							if(err) throw err;
							var var_i,var_ii,team_1,team_2,referee,time,score;
							var temp_team = [];
							
							for(var_i=0;var_i<=34;var_i ++){
								
								if((items[var_i].team1 == "E") || (items[var_i].team2 == "E") || (items[var_i].referee == "E")){
									
									/*time=items[var_i].time;
									team_1=items[var_i].team1;
									team_2=items[var_i].team2;
									referee=items[var_i].referee;
									score=items[var_i].score;
									
									temp_team.push(time);
									temp_team.push(team_1);
									temp_team.push(team_2);
									temp_team.push(score);
									temp_team.push(referee);*/
								
									temp_team.push(items[var_i]);
									
									//console.log(temp_team[0].time);
									//console.log(temp_team[0].team1);
									
								}else{
									//console.log("not_found");
								}
							}
							console.log(temp_team);
							var msg = "";
							for(var_i=0;var_i<(temp_team.length);var_i ++){
								
								msg += "\n"+"第"+temp_team[var_i].date +"天"+"\n"+
									temp_team[var_i].time +
									"\n"+team_list[temp_team[var_i].team1]+""+"v.s."+""+team_list[temp_team[var_i].team2]+
									"\n"+"場地:"+""+court_list[temp_team[var_i].court]+
									"\n"+"比分:"+""+temp_team[var_i].score+
									"\n"+"裁判:"+""+team_list[temp_team[var_i].referee]+"\n";
								
							}
							sendTextMessage(senderID,msg);
							db.close(); //關閉連線
						});
							
					});
				
					
					
				}
		});	
        break;
	  case '藥學':
         //sendTimeTextMessage(senderID, messageText);
			 MongoClient.connect("mongodb://140.116.245.243:27017/NCKUVB", function(err, db) {
			
				if(!err) {
					console.log("We are connected mongodb");
					db.collection('match',function(err,collection){
												 
						collection.find({}).toArray(function(err,items){
							if(err) throw err;
							var var_i,var_ii,team_1,team_2,referee,time,score;
							var temp_team = [];
							
							for(var_i=0;var_i<=34;var_i ++){
								
								if((items[var_i].team1 == "A") || (items[var_i].team2 == "A") || (items[var_i].referee == "A")){
									
									temp_team.push(items[var_i]);
								}
							}
							console.log(temp_team);
							var msg = "";
							for(var_i=0;var_i<(temp_team.length);var_i ++){
								msg += "\n"+"第"+temp_team[var_i].date +"天"+"\n"+
									temp_team[var_i].time +
									"\n"+team_list[temp_team[var_i].team1]+""+"v.s."+""+team_list[temp_team[var_i].team2]+
									"\n"+"場地:"+""+court_list[temp_team[var_i].court]+
									"\n"+"比分:"+""+temp_team[var_i].score+
									"\n"+"裁判:"+""+team_list[temp_team[var_i].referee]+"\n";
								
							}
							sendTextMessage(senderID,msg);
							db.close(); //關閉連線
						});
							
					});
				
					
					
				}
		});	
        break;
	case '會計':
         //sendTimeTextMessage(senderID, messageText);
			 MongoClient.connect("mongodb://140.116.245.243:27017/NCKUVB", function(err, db) {
			
				if(!err) {
					console.log("We are connected mongodb");
					db.collection('match',function(err,collection){
												 
						collection.find({}).toArray(function(err,items){
							if(err) throw err;
							var var_i,var_ii,team_1,team_2,referee,time,score;
							var temp_team = [];
							
							for(var_i=0;var_i<=34;var_i ++){
								
								if((items[var_i].team1 == "B") || (items[var_i].team2 == "B") || (items[var_i].referee == "B")){
									
									temp_team.push(items[var_i]);
								}
							}
							console.log(temp_team);
							var msg = "";
							for(var_i=0;var_i<(temp_team.length);var_i ++){
								msg += "\n"+"第"+temp_team[var_i].date +"天"+"\n"+
									temp_team[var_i].time +
									"\n"+team_list[temp_team[var_i].team1]+""+"v.s."+""+team_list[temp_team[var_i].team2]+
									"\n"+"場地:"+""+court_list[temp_team[var_i].court]+
									"\n"+"比分:"+""+temp_team[var_i].score+
									"\n"+"裁判:"+""+team_list[temp_team[var_i].referee]+"\n";
								
							}
							sendTextMessage(senderID,msg);
							db.close(); //關閉連線
						});
							
					});
				
					
					
				}
		});	
        break;
	case '電機':
         //sendTimeTextMessage(senderID, messageText);
			 MongoClient.connect("mongodb://140.116.245.243:27017/NCKUVB", function(err, db) {
			
				if(!err) {
					console.log("We are connected mongodb");
					db.collection('match',function(err,collection){
												 
						collection.find({}).toArray(function(err,items){
							if(err) throw err;
							var var_i,var_ii,team_1,team_2,referee,time,score;
							var temp_team = [];
							
							for(var_i=0;var_i<=34;var_i ++){
								
								if((items[var_i].team1 == "C") || (items[var_i].team2 == "C") || (items[var_i].referee == "C")){
									
									temp_team.push(items[var_i]);
								}
							}
							console.log(temp_team);
							var msg = "";
							for(var_i=0;var_i<(temp_team.length);var_i ++){
								msg += "\n"+"第"+temp_team[var_i].date +"天"+"\n"+
									temp_team[var_i].time +
									"\n"+team_list[temp_team[var_i].team1]+""+"v.s."+""+team_list[temp_team[var_i].team2]+
									"\n"+"場地:"+""+court_list[temp_team[var_i].court]+
									"\n"+"比分:"+""+temp_team[var_i].score+
									"\n"+"裁判:"+""+team_list[temp_team[var_i].referee]+"\n";
								
							}
							sendTextMessage(senderID,msg);
							db.close(); //關閉連線
						});
							
					});
				
					
					
				}
		});	
        break;
    case '材料':
         //sendTimeTextMessage(senderID, messageText);
			 MongoClient.connect("mongodb://140.116.245.243:27017/NCKUVB", function(err, db) {
			
				if(!err) {
					console.log("We are connected mongodb");
					db.collection('match',function(err,collection){
												 
						collection.find({}).toArray(function(err,items){
							if(err) throw err;
							var var_i,var_ii,team_1,team_2,referee,time,score;
							var temp_team = [];
							
							for(var_i=0;var_i<=34;var_i ++){
								
								if((items[var_i].team1 == "D") || (items[var_i].team2 == "D") || (items[var_i].referee == "D")){
									
									temp_team.push(items[var_i]);
								}
							}
							console.log(temp_team);
							var msg = "";
							for(var_i=0;var_i<(temp_team.length);var_i ++){
								msg += "\n"+"第"+temp_team[var_i].date +"天"+"\n"+
									temp_team[var_i].time +
									"\n"+team_list[temp_team[var_i].team1]+""+"v.s."+""+team_list[temp_team[var_i].team2]+
									"\n"+"場地:"+""+court_list[temp_team[var_i].court]+
									"\n"+"比分:"+""+temp_team[var_i].score+
									"\n"+"裁判:"+""+team_list[temp_team[var_i].referee]+"\n";
								
							}
							sendTextMessage(senderID,msg);
							db.close(); //關閉連線
						});
							
					});
				
					
					
				}
		});	
        break;
	case '化工':
         //sendTimeTextMessage(senderID, messageText);
			 MongoClient.connect("mongodb://140.116.245.243:27017/NCKUVB", function(err, db) {
			
				if(!err) {
					console.log("We are connected mongodb");
					db.collection('match',function(err,collection){
												 
						collection.find({}).toArray(function(err,items){
							if(err) throw err;
							var var_i,var_ii,team_1,team_2,referee,time,score;
							var temp_team = [];
							
							for(var_i=0;var_i<=34;var_i ++){
								
								if((items[var_i].team1 == "F") || (items[var_i].team2 == "F") || (items[var_i].referee == "F")){
									
									temp_team.push(items[var_i]);
								}
							}
							console.log(temp_team);
							var msg = "";
							for(var_i=0;var_i<(temp_team.length);var_i ++){
								msg += "\n"+"第"+temp_team[var_i].date +"天"+"\n"+
									temp_team[var_i].time +
									"\n"+team_list[temp_team[var_i].team1]+""+"v.s."+""+team_list[temp_team[var_i].team2]+
									"\n"+"場地:"+""+court_list[temp_team[var_i].court]+
									"\n"+"比分:"+""+temp_team[var_i].score+
									"\n"+"裁判:"+""+team_list[temp_team[var_i].referee]+"\n";
								
							}
							sendTextMessage(senderID,msg);
							db.close(); //關閉連線
						});
							
					});
				
					
					
				}
		});	
        break;
	case '醫學':
         //sendTimeTextMessage(senderID, messageText);
			 MongoClient.connect("mongodb://140.116.245.243:27017/NCKUVB", function(err, db) {
			
				if(!err) {
					console.log("We are connected mongodb");
					db.collection('match',function(err,collection){
												 
						collection.find({}).toArray(function(err,items){
							if(err) throw err;
							var var_i,var_ii,team_1,team_2,referee,time,score;
							var temp_team = [];
							
							for(var_i=0;var_i<=34;var_i ++){
								
								if((items[var_i].team1 == "G") || (items[var_i].team2 == "G") || (items[var_i].referee == "G")){
									
									temp_team.push(items[var_i]);
								}
							}
							console.log(temp_team);
							var msg = "";
							for(var_i=0;var_i<(temp_team.length);var_i ++){
								msg += "\n"+"第"+temp_team[var_i].date +"天"+"\n"+
									temp_team[var_i].time +
									"\n"+team_list[temp_team[var_i].team1]+""+"v.s."+""+team_list[temp_team[var_i].team2]+
									"\n"+"場地:"+""+court_list[temp_team[var_i].court]+
									"\n"+"比分:"+""+temp_team[var_i].score+
									"\n"+"裁判:"+""+team_list[temp_team[var_i].referee]+"\n";
								
							}
							sendTextMessage(senderID,msg);
							db.close(); //關閉連線
						});
							
					});
				
					
					
				}
		});	
        break;
	case '法律':
         //sendTimeTextMessage(senderID, messageText);
			 MongoClient.connect("mongodb://140.116.245.243:27017/NCKUVB", function(err, db) {
			
				if(!err) {
					console.log("We are connected mongodb");
					db.collection('match',function(err,collection){
												 
						collection.find({}).toArray(function(err,items){
							if(err) throw err;
							var var_i,var_ii,team_1,team_2,referee,time,score;
							var temp_team = [];
							
							for(var_i=0;var_i<=34;var_i ++){
								
								if((items[var_i].team1 == "H") || (items[var_i].team2 == "H") || (items[var_i].referee == "H")){
									
									temp_team.push(items[var_i]);
								}
							}
							console.log(temp_team);
							var msg = "";
							for(var_i=0;var_i<(temp_team.length);var_i ++){
								msg += "\n"+"第"+temp_team[var_i].date +"天"+"\n"+
									temp_team[var_i].time +
									"\n"+team_list[temp_team[var_i].team1]+""+"v.s."+""+team_list[temp_team[var_i].team2]+
									"\n"+"場地:"+""+court_list[temp_team[var_i].court]+
									"\n"+"比分:"+""+temp_team[var_i].score+
									"\n"+"裁判:"+""+team_list[temp_team[var_i].referee]+"\n";
								
							}
							sendTextMessage(senderID,msg);
							db.close(); //關閉連線
						});
							
					});
				
					
					
				}
		});	
        break;
	case '歷史':
         //sendTimeTextMessage(senderID, messageText);
			 MongoClient.connect("mongodb://140.116.245.243:27017/NCKUVB", function(err, db) {
			
				if(!err) {
					console.log("We are connected mongodb");
					db.collection('match',function(err,collection){
												 
						collection.find({}).toArray(function(err,items){
							if(err) throw err;
							var var_i,var_ii,team_1,team_2,referee,time,score;
							var temp_team = [];
							
							for(var_i=0;var_i<=34;var_i ++){
								
								if((items[var_i].team1 == "I") || (items[var_i].team2 == "I") || (items[var_i].referee == "I")){
									
									temp_team.push(items[var_i]);
								}
							}
							console.log(temp_team);
							var msg = "";
							for(var_i=0;var_i<(temp_team.length);var_i ++){
								msg += "\n"+"第"+temp_team[var_i].date +"天"+"\n"+
									temp_team[var_i].time +
									"\n"+team_list[temp_team[var_i].team1]+""+"v.s."+""+team_list[temp_team[var_i].team2]+
									"\n"+"場地:"+""+court_list[temp_team[var_i].court]+
									"\n"+"比分:"+""+temp_team[var_i].score+
									"\n"+"裁判:"+""+team_list[temp_team[var_i].referee]+"\n";
								
							}
							sendTextMessage(senderID,msg);
							db.close(); //關閉連線
						});
							
					});
				
					
					
				}
		});	
        break;
	case '航太':
         //sendTimeTextMessage(senderID, messageText);
			 MongoClient.connect("mongodb://140.116.245.243:27017/NCKUVB", function(err, db) {
			
				if(!err) {
					console.log("We are connected mongodb");
					db.collection('match',function(err,collection){
												 
						collection.find({}).toArray(function(err,items){
							if(err) throw err;
							var var_i,var_ii,team_1,team_2,referee,time,score;
							var temp_team = [];
							
							for(var_i=0;var_i<=34;var_i ++){
								
								if((items[var_i].team1 == "J") || (items[var_i].team2 == "J") || (items[var_i].referee == "J")){
									
									temp_team.push(items[var_i]);
								}
							}
							console.log(temp_team);
							var msg = "";
							for(var_i=0;var_i<(temp_team.length);var_i ++){
								msg += "\n"+"第"+temp_team[var_i].date +"天"+"\n"+
									temp_team[var_i].time +
									"\n"+team_list[temp_team[var_i].team1]+""+"v.s."+""+team_list[temp_team[var_i].team2]+
									"\n"+"場地:"+""+court_list[temp_team[var_i].court]+
									"\n"+"比分:"+""+temp_team[var_i].score+
									"\n"+"裁判:"+""+team_list[temp_team[var_i].referee]+"\n";
								
							}
							sendTextMessage(senderID,msg);
							db.close(); //關閉連線
						});
							
					});
				
					
					
				}
		});	
        break;
	case '土木':
         //sendTimeTextMessage(senderID, messageText);
			 MongoClient.connect("mongodb://140.116.245.243:27017/NCKUVB", function(err, db) {
			
				if(!err) {
					console.log("We are connected mongodb");
					db.collection('match',function(err,collection){
												 
						collection.find({}).toArray(function(err,items){
							if(err) throw err;
							var var_i,var_ii,team_1,team_2,referee,time,score;
							var temp_team = [];
							
							for(var_i=0;var_i<=34;var_i ++){
								
								if((items[var_i].team1 == "K") || (items[var_i].team2 == "K") || (items[var_i].referee == "K")){
									
									temp_team.push(items[var_i]);
								}
							}
							console.log(temp_team);
							var msg = "";
							for(var_i=0;var_i<(temp_team.length);var_i ++){
								msg += "\n"+"第"+temp_team[var_i].date +"天"+"\n"+
									temp_team[var_i].time +
									"\n"+team_list[temp_team[var_i].team1]+""+"v.s."+""+team_list[temp_team[var_i].team2]+
									"\n"+"場地:"+""+court_list[temp_team[var_i].court]+
									"\n"+"比分:"+""+temp_team[var_i].score+
									"\n"+"裁判:"+""+team_list[temp_team[var_i].referee]+"\n";
								
							}
							sendTextMessage(senderID,msg);
							db.close(); //關閉連線
						});
							
					});
				
					
					
				}
		});	
        break;
	case '建築':
         //sendTimeTextMessage(senderID, messageText);
			 MongoClient.connect("mongodb://140.116.245.243:27017/NCKUVB", function(err, db) {
			
				if(!err) {
					console.log("We are connected mongodb");
					db.collection('match',function(err,collection){
												 
						collection.find({}).toArray(function(err,items){
							if(err) throw err;
							var var_i,var_ii,team_1,team_2,referee,time,score;
							var temp_team = [];
							
							for(var_i=0;var_i<=34;var_i ++){
								
								if((items[var_i].team1 == "L") || (items[var_i].team2 == "L") || (items[var_i].referee == "L")){
									
									temp_team.push(items[var_i]);
								}
							}
							console.log(temp_team);
							var msg = "";
							for(var_i=0;var_i<(temp_team.length);var_i ++){
								msg += "\n"+"第"+temp_team[var_i].date +"天"+"\n"+
									temp_team[var_i].time +
									"\n"+team_list[temp_team[var_i].team1]+""+"v.s."+""+team_list[temp_team[var_i].team2]+
									"\n"+"場地:"+""+court_list[temp_team[var_i].court]+
									"\n"+"比分:"+""+temp_team[var_i].score+
									"\n"+"裁判:"+""+team_list[temp_team[var_i].referee]+"\n";
								
							}
							sendTextMessage(senderID,msg);
							db.close(); //關閉連線
						});
							
					});
				
					
					
				}
		});	
        break;
	case '經濟':
         //sendTimeTextMessage(senderID, messageText);
			 MongoClient.connect("mongodb://140.116.245.243:27017/NCKUVB", function(err, db) {
			
				if(!err) {
					console.log("We are connected mongodb");
					db.collection('match',function(err,collection){
												 
						collection.find({}).toArray(function(err,items){
							if(err) throw err;
							var var_i,var_ii,team_1,team_2,referee,time,score;
							var temp_team = [];
							
							for(var_i=0;var_i<=34;var_i ++){
								
								if((items[var_i].team1 == "M") || (items[var_i].team2 == "M") || (items[var_i].referee == "M")){
									
									temp_team.push(items[var_i]);
								}
							}
							console.log(temp_team);
							var msg = "";
							for(var_i=0;var_i<(temp_team.length);var_i ++){
								msg += "\n"+"第"+temp_team[var_i].date +"天"+"\n"+
									temp_team[var_i].time +
									"\n"+team_list[temp_team[var_i].team1]+""+"v.s."+""+team_list[temp_team[var_i].team2]+
									"\n"+"場地:"+""+court_list[temp_team[var_i].court]+
									"\n"+"比分:"+""+temp_team[var_i].score+
									"\n"+"裁判:"+""+team_list[temp_team[var_i].referee]+"\n";
								
							}
							sendTextMessage(senderID,msg);
							db.close(); //關閉連線
						});
							
					});
				
					
					
				}
		});	
        break;
	case '工資管':
         //sendTimeTextMessage(senderID, messageText);
			 MongoClient.connect("mongodb://140.116.245.243:27017/NCKUVB", function(err, db) {
			
				if(!err) {
					console.log("We are connected mongodb");
					db.collection('match',function(err,collection){
												 
						collection.find({}).toArray(function(err,items){
							if(err) throw err;
							var var_i,var_ii,team_1,team_2,referee,time,score;
							var temp_team = [];
							
							for(var_i=0;var_i<=34;var_i ++){
								
								if((items[var_i].team1 == "N") || (items[var_i].team2 == "N") || (items[var_i].referee == "N")){
									
									temp_team.push(items[var_i]);
								}
							}
							console.log(temp_team);
							var msg = "";
							for(var_i=0;var_i<(temp_team.length);var_i ++){
								msg += "\n"+"第"+temp_team[var_i].date +"天"+"\n"+
									temp_team[var_i].time +
									"\n"+team_list[temp_team[var_i].team1]+""+"v.s."+""+team_list[temp_team[var_i].team2]+
									"\n"+"場地:"+""+court_list[temp_team[var_i].court]+
									"\n"+"比分:"+""+temp_team[var_i].score+
									"\n"+"裁判:"+""+team_list[temp_team[var_i].referee]+"\n";
								
							}
							sendTextMessage(senderID,msg);
							db.close(); //關閉連線
						});
							
					});
				
					
					
				}
		});	
        break;
	case '工設':
         //sendTimeTextMessage(senderID, messageText);
			 MongoClient.connect("mongodb://140.116.245.243:27017/NCKUVB", function(err, db) {
			
				if(!err) {
					console.log("We are connected mongodb");
					db.collection('match',function(err,collection){
												 
						collection.find({}).toArray(function(err,items){
							if(err) throw err;
							var var_i,var_ii,team_1,team_2,referee,time,score;
							var temp_team = [];
							
							for(var_i=0;var_i<=34;var_i ++){
								
								if((items[var_i].team1 == "O") || (items[var_i].team2 == "O") || (items[var_i].referee == "O")){
									
									temp_team.push(items[var_i]);
								}
							}
							console.log(temp_team);
							var msg = "";
							for(var_i=0;var_i<(temp_team.length);var_i ++){
								msg += "\n"+"第"+temp_team[var_i].date +"天"+"\n"+
									temp_team[var_i].time +
									"\n"+team_list[temp_team[var_i].team1]+""+"v.s."+""+team_list[temp_team[var_i].team2]+
									"\n"+"場地:"+""+court_list[temp_team[var_i].court]+
									"\n"+"比分:"+""+temp_team[var_i].score+
									"\n"+"裁判:"+""+team_list[temp_team[var_i].referee]+"\n";
								
							}
							sendTextMessage(senderID,msg);
							db.close(); //關閉連線
						});
							
					});
				
					
					
				}
		});	
        break;
	case '水利':
         //sendTimeTextMessage(senderID, messageText);
			 MongoClient.connect("mongodb://140.116.245.243:27017/NCKUVB", function(err, db) {
			
				if(!err) {
					console.log("We are connected mongodb");
					db.collection('match',function(err,collection){
												 
						collection.find({}).toArray(function(err,items){
							if(err) throw err;
							var var_i,var_ii,team_1,team_2,referee,time,score;
							var temp_team = [];
							
							for(var_i=0;var_i<=34;var_i ++){
								
								if((items[var_i].team1 == "P") || (items[var_i].team2 == "P") || (items[var_i].referee == "P")){
									
									temp_team.push(items[var_i]);
								}
							}
							console.log(temp_team);
							var msg = "";
							for(var_i=0;var_i<(temp_team.length);var_i ++){
								msg += "\n"+"第"+temp_team[var_i].date +"天"+"\n"+
									temp_team[var_i].time +
									"\n"+team_list[temp_team[var_i].team1]+""+"v.s."+""+team_list[temp_team[var_i].team2]+
									"\n"+"場地:"+""+court_list[temp_team[var_i].court]+
									"\n"+"比分:"+""+temp_team[var_i].score+
									"\n"+"裁判:"+""+team_list[temp_team[var_i].referee]+"\n";
								
							}
							sendTextMessage(senderID,msg);
							db.close(); //關閉連線
						});
							
					});
				
					
					
				}
		});	
        break;
		
      case '謝謝':
         sendThankTextMessage(senderID, messageText);
        break;

      default:
        //sendTextMessage(senderID, messageText);
		sendTextMessage(senderID, "輸入Hi   將有機器人為您服務＃￣▽￣＃");
    }
  } else if (messageAttachments) {
    sendTextMessage(senderID, "Message with attachment received");
  }
}

/*
 * Delivery Confirmation Event
 *
 * This event is sent to confirm the delivery of a message. Read more about 
 * these fields at https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-delivered
 *
 */
function receivedDeliveryConfirmation(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var delivery = event.delivery;
  var messageIDs = delivery.mids;
  var watermark = delivery.watermark;
  var sequenceNumber = delivery.seq;

  if (messageIDs) {
    messageIDs.forEach(function(messageID) {
      console.log("Received delivery confirmation for message ID: %s", 
        messageID);
    });
  }

  console.log("All message before %d were delivered.", watermark);
}


/*
 * Postback Event
 *
 * This event is called when a postback is tapped on a Structured Message. 
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/postback-received
 * 
 */
function receivedPostback(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;
  var timeOfPostback = event.timestamp;
  
  
  // The 'payload' param is a developer-defined field which is set in a postback 
  // button for Structured Messages. 
  var payload = event.postback.payload;

  console.log("Received postback for user %d and page %d with payload '%s' " + 
    "at %d", senderID, recipientID, payload, timeOfPostback);
  //sendTextMessage(senderID, "Postback");
  
	if(payload == "get_start"){
		sendHiButtonMessage(senderID);
	}
	if(payload == "hi_ask"){
		sendButtonMessage(senderID);
	}
	if(payload == "hi_image"){
		sendImageMessage(senderID);
	}
	if(payload == "subscription"){
	
		sendQuickReply(senderID);
	}
	if(payload == "query"){
		
		MongoClient.connect("mongodb://140.116.245.243:27017/NCKUVB", function(err, db) {
		
			if(!err) {
			console.log("We are connected mongodb");
			db.collection('subscription',function(err,collection){
			collection.find({User_id:senderID}).toArray(function(err,items){
            if(err) throw err;
			console.log(items);
            console.log("We found "+items.length+" results!");
			subscription_team=items[0].Name;	
			console.log(subscription_team);
			
				if(subscription_team == "A"){
				sendTextMessage(senderID, "您已訂閱藥學￣︶￣");
				}
				if(subscription_team == "B"){
				sendTextMessage(senderID, "您已訂閱會計￣︶￣");
				}
				if(subscription_team == "C"){
				sendTextMessage(senderID, "您已訂閱電機￣︶￣");
				}
				if(subscription_team == "D"){
				sendTextMessage(senderID, "您已訂閱材料￣︶￣");
				}
				if(subscription_team == "E"){
				sendTextMessage(senderID, "您已訂閱資訊￣︶￣");
				}
				if(subscription_team == "F"){
				sendTextMessage(senderID, "您已訂閱化工￣︶￣");
				}
				if(subscription_team == "G"){
				sendTextMessage(senderID, "您已訂閱醫學￣︶￣");
				}
				if(subscription_team == "H"){
				sendTextMessage(senderID, "您已訂閱法律￣︶￣");
				}
				if(subscription_team == "I"){
				sendTextMessage(senderID, "您已訂閱歷史￣︶￣");
				}
				if(subscription_team == "J"){
				sendTextMessage(senderID, "您已訂閱航太￣︶￣");
				}
				if(subscription_team == "K"){
				sendTextMessage(senderID, "您已訂閱土木￣︶￣");
				}
				if(subscription_team == "L"){
				sendTextMessage(senderID, "您已訂閱建築￣︶￣");
				}
				if(subscription_team == "M"){
				sendTextMessage(senderID, "您已訂閱經濟￣︶￣");
				}
				if(subscription_team == "N"){
				sendTextMessage(senderID, "您已訂閱工資管￣︶￣");
				}
				if(subscription_team == "O"){
				sendTextMessage(senderID, "您已訂閱工設￣︶￣");
				}
				if(subscription_team == "P"){
				sendTextMessage(senderID, "您已訂閱水利￣︶￣");
				}
			
			});//查詢
			});
			db.close(); //關閉連線
			}
		});
		
		sendHiButtonMessage(senderID);
	}
	if(payload == "cancel"){
		MongoClient.connect("mongodb://140.116.245.243:27017/NCKUVB", function(err, db) {
		
		if(!err) {
		console.log("We are connected mongodb");
			db.collection('subscription',function(err,collection){
			collection.remove({User_id:senderID});//刪除collection
			db.close(); //關閉連線
			});
		}
		});
		sendTextMessage(senderID, "取消訂閱成功︶︿︶");
		sendHiButtonMessage(senderID);
	}
}

/*
 * Message Read Event
 *
 * This event is called when a previously-sent message has been read.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-read
 * 
 */
function receivedMessageRead(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;

  // All messages before watermark (a timestamp) or sequence have been seen.
  var watermark = event.read.watermark;
  var sequenceNumber = event.read.seq;

  console.log("Received message read event for watermark %d and sequence " +
    "number %d", watermark, sequenceNumber);
}

/*
 * Account Link Event
 *
 * This event is called when the Link Account or UnLink Account action has been
 * tapped.
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/account-linking
 * 
 */
function receivedAccountLink(event) {
  var senderID = event.sender.id;
  var recipientID = event.recipient.id;

  var status = event.account_linking.status;
  var authCode = event.account_linking.authorization_code;

  console.log("Received account link event with for user %d with status %s " +
    "and auth code %s ", senderID, status, authCode);
}

/*
 * Send an image using the Send API.
 *
 */
function sendImageMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "image",
        payload: {
          url:"https://imgur.com/c6779h8.jpg"
		  //url: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ9LX0tn8C_PW1cXBep05JSmrwXpAfCNjByCfEDiHKbwIufubP5Qg"
        }
      }
    }
  };

  callSendAPI(messageData);
}

function sendTextMessage(recipientId, messageText) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: messageText,
      metadata: "DEVELOPER_DEFINED_METADATA"
    }
  };

  callSendAPI(messageData);
}
function sendTimeTextMessage(recipientId, messageText) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "11:00 vs 電機",
      metadata: "DEVELOPER_DEFINED_METADATA"
    }
  };

  callSendAPI(messageData);
}
function sendThankTextMessage(recipientId, messageText) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "愛你  ｡:.ﾟヽ(*´∀`)ﾉﾟ.:｡",
      metadata: "DEVELOPER_DEFINED_METADATA"
    }
  };

  callSendAPI(messageData);
}
function sendHiButtonMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "*輸入Hi 呼叫主選單\n*欲查詢賽程請輸入隊伍名稱，ex: 資訊",
          buttons:[{
            /*type: "web_url",
            url: "https://imgur.com/c6779h8.jpg",
            title: "查看總賽程圖"*/
			
			type: "postback",
            title: "查看總賽程圖",
            payload: "hi_image"
		   
          }, {
           type: "postback",
           title: "我要訂閱某隊伍的賽程",
           payload: "hi_ask"
          },{
            type: "web_url",
            url: "https://docs.google.com/forms/d/e/1FAIpQLSdbt7Enj5tibQOuHV1w8QZ6wIQ2UFOtrAcCg3NoC_PHtLUXiw/viewform",
            title: "回饋單"
          }]
        }
      }
    }
  };  

  callSendAPI(messageData);
}
function sendButtonMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "訂閱隊伍會主動通知賽程",
          buttons:[{
            type: "postback",
           title: "訂閱隊伍",
           payload: "subscription"
          }, {
           type: "postback",
           title: "查詢已訂閱隊伍",
           payload: "query"
          },{
             type: "postback",
           title: "取消訂閱",
           payload: "cancel"
          }]
        }
      }
    }
  };  

  callSendAPI(messageData);
}

function sendGenericMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "generic",
          elements: [{
            title: "rift",
            subtitle: "Next-generation virtual reality",
            item_url: "https://www.oculus.com/en-us/rift/",               
            image_url: SERVER_URL + "/assets/rift.png",
            buttons: [{
              type: "web_url",
              url: "https://www.oculus.com/en-us/rift/",
              title: "Open Web URL"
            }, {
              type: "postback",
              title: "Call Postback",
              payload: "Payload for first bubble",
            }],
          }, {
            title: "touch",
            subtitle: "Your Hands, Now in VR",
            item_url: "https://www.oculus.com/en-us/touch/",               
            image_url: SERVER_URL + "/assets/touch.png",
            buttons: [{
              type: "web_url",
              url: "https://www.oculus.com/en-us/touch/",
              title: "Open Web URL"
            }, {
              type: "postback",
              title: "Call Postback",
              payload: "Payload for second bubble",
            }]
          }]
        }
      }
    }
  };  

  callSendAPI(messageData);
}
function sendQuickReply(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "請選擇隊伍所屬循環(不知道的話，可查看總賽程圖)",
      quick_replies: [
        {
          "content_type":"text",
          "title":"甲",
          "payload":"QuickReply_A"
        },
		
		{
          "content_type":"text",
          "title":"乙",
          "payload":"QuickReply_B"
        },
		{
          "content_type":"text",
          "title":"丙",
          "payload":"QuickReply_C"
        }
      ]
    }
  };

  callSendAPI(messageData);
}
function sendQuickReply_A(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "請選擇訂閱隊伍⊙△⊙(只限一隊)",
      quick_replies: [
        {
          "content_type":"text",
          "title":"資訊",
          "payload":"subscription_csie"
        },
		
		{
          "content_type":"text",
          "title":"電機",
          "payload":"subscription_ee"
        },
		{
          "content_type":"text",
          "title":"材料",
          "payload":"subscription_mse"
        },
		
		{
          "content_type":"text",
          "title":"會計",
          "payload":"subscription_acc"
        },
		
		{
          "content_type":"text",
          "title":"藥學",
          "payload":"subscription_phar"
        }
      ]
    }
  };

  callSendAPI(messageData);
}
function sendQuickReply_B(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "請選擇訂閱隊伍⊙△⊙(只限一隊)",
      quick_replies: [
        
        {
          "content_type":"text",
          "title":"化工",
          "payload":"subscription_che"
        },
		
		{
          "content_type":"text",
          "title":"法律",
          "payload":"subscription_law"
        },
		
		{
          "content_type":"text",
          "title":"航太",
          "payload":"subscription_aa"
        },
		
		{
          "content_type":"text",
          "title":"歷史",
          "payload":"subscription_his"
        },
		
		{
          "content_type":"text",
          "title":"醫學",
          "payload":"subscription_med"
        }
      ]
    }
  };

  callSendAPI(messageData);
}
function sendQuickReply_C(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "請選擇訂閱隊伍⊙△⊙(只限一隊)",
      quick_replies: [
        
		{
          "content_type":"text",
          "title":"土木",
          "payload":"subscription_civil"
        },
        {
          "content_type":"text",
          "title":"經濟",
          "payload":"subscription_eco"
        },
		
		{
          "content_type":"text",
          "title":"建築",
          "payload":"subscription_arch"
        },
		
		{
          "content_type":"text",
          "title":"工資管",
          "payload":"subscription_iim"
        },
		
		{
          "content_type":"text",
          "title":"水利",
          "payload":"subscription_hyd"
        },
		
		{
          "content_type":"text",
          "title":"工設",
          "payload":"subscription_id"
        }
      ]
    }
  };

  callSendAPI(messageData);
}
function sendTypingOn(recipientId) {
  console.log("Turning typing indicator on");

  var messageData = {
    recipient: {
      id: recipientId
    },
    sender_action: "typing_on"
  };

  callSendAPI(messageData);
}

/*
 * Call the Send API. The message data goes in the body. If successful, we'll 
 * get the message id in a response 
 *
 */
function callSendAPI(messageData) {
  request({
    uri: 'https://graph.facebook.com/v2.6/me/messages',
    qs: { access_token: PAGE_ACCESS_TOKEN },
    method: 'POST',
    json: messageData

  }, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      var recipientId = body.recipient_id;
      var messageId = body.message_id;

      if (messageId) {
        console.log("Successfully sent message with id %s to recipient %s", 
          messageId, recipientId);
      } else {
      console.log("Successfully called Send API for recipient %s", 
        recipientId);
      }
    } else {
      console.error("Failed calling Send API", response.statusCode, response.statusMessage, body.error);
    }
  });  
}

String.prototype.replaceAll = function(search, replacement) {
    var target = this;
    return target.replace(new RegExp(search, 'g'), replacement);
};

function getAnswer(send_text,event){
  var senderID=event.sender.id;
  var question;
  
  var reply_msg;
	var translate_str;

	reply_msg='';
	switch (send_text) {
		case "test":
			//getNewsWord();
			break;
		case "Hi~How Are You?":
			reply_msg= "I am fine" ;
			break;
		case "decide the color(R:1,G:0,B:0) is white or black?":
		  question={r:1,g:0.4,b:0};
		  reply_msg=getResultOfRobotUsingNN(question);
		  break;
		case "who are you":
		case "who are you?":
	  case "who're you?":
	 		reply_msg= "I'm Mr.Wang" ;
			break;
		case "training":
		  training_model();
		  reply_msg="training data..."
		  break;

	  case "n0":
		  question=get_testing_data(0);
		  reply_msg="your condition is "+JSON.stringify(question)+"\n";
		  reply_msg+=getNNResult(question);
      break;
	  case "n1":
		  question=get_testing_data(1);
		  reply_msg="your condition is "+JSON.stringify(question)+"\n";
		  reply_msg+=getNNResult(question);
	    break;
	  case "n2":
		  question=get_testing_data(2);
		  reply_msg="your condition is "+JSON.stringify(question)+"\n";
		  reply_msg+=getNNResult(question);

	    break;
	  case "n3":
		  question=get_testing_data(3);
		  reply_msg="your condition is "+JSON.stringify(question)+"\n";
		  reply_msg+=getNNResult(question);

	    break;
	  case "n4":
		  question=get_testing_data(4);
		  reply_msg="your condition is "+JSON.stringify(question)+"\n";
		  reply_msg+=getNNResult(question);

	    break;
	  case "n5":
		  question=get_testing_data(5);
		  reply_msg="your condition is "+JSON.stringify(question)+"\n";
		  reply_msg+=getNNResult(question);
	    break;
	    
	  case "n6":
		  question=get_testing_data(6);
		  reply_msg="your condition is "+JSON.stringify(question)+"\n";
		  reply_msg+=getNNResult(question);
	    break;
	    
	  case "n7":
		  question=get_testing_data(7);
		  reply_msg="your condition is "+JSON.stringify(question)+"\n";
		  reply_msg+=getNNResult(question);
	    break;
	    
	  case "n8":
		  question=get_testing_data(8);
		  reply_msg="your condition is "+JSON.stringify(question)+"\n";
		  reply_msg+=getNNResult(question);
	    break;
	    
	  case "n9":
		  question=get_testing_data(9);
		  reply_msg="your condition is "+JSON.stringify(question)+"\n";
		  reply_msg+=getNNResult(question);
	    break;
 
	 
	  case "OK":
	    reply_msg='how long have you study?\n';
	    break;	    
		case "4 hours everyday":
		  reply_msg='your family size is less than 3?';
		  break;
		case "no, I have six sister and one brother.":
		  reply_msg="I see...";
		  break;
		default:
			if (/^我是*/.test(send_text) ){
				reply_msg="喔喔～";
			}else{
				var maxNum = 18;  
				var minNum = 1;  
				var question_num = Math.floor(Math.random() * (maxNum - minNum + 1)) + minNum; 
				switch (question_num) {
				 	case 1:
				 		reply_msg='你平常花多久時間從家裡到學校呢？';
				 		break;
				 	case 2:
				 		reply_msg='平常大概花多久時間讀書？';
				 		break;
				 	case 3:
				 		reply_msg='';
				 		break;
				 	case 4:
				 	case 6:
				 	case 8:
				 	case 9:
				 	case 7:
				 		reply_msg='你好\n'+
				 			'我要給你幸福'+
				 			'好!幸!福!\n';
			 			break;
				 	case 14:
				 	case 10:
				 		reply_msg="今天星期幾";
				 		break;
				 	case 11:
				 		reply_msg="天氣如何";
				 		break;
				 	default:
				 		reply_msg='你好～你好喔～這陣子還好嗎？';
				 		break;
				 } 
				
			}
			break;
	}
    if(reply_msg.length==0) 
    	return;
   	else{
    	//api.sendMessage(reply_msg, event.thread_id);
	    //pausecomp(3000);

   	}
   	return reply_msg;
}
//escapeHTML function
function escapeHtml(unsafe) {
    return unsafe
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");
 }
//escapeHTML function end



//translate function end
function getResultOfRobotUsingNN(question){
  console.log("In NN Algorithm");
  var result;
  
  // this is training data
  
  net.train([
      {
        input   :{r:0.03,g:0.7,b:0.5},
        output  :{black:1},
      },
      {
        input :{r:0.16,g:0.09,b:0.2},
        output:{white:1}
      },
      {
        input :{r:0.5,g:0.5,b:1.0},
        output:{white:1}
      }
    ]);
  console.log("NN Result calculating");
  //parameter is input data, and run function will get the result of NN
  result=net.run(question);
  console.log("NN Result"+result);
  
  return "black is "+result.black+"and white is "+result.white+".";
}

function training_model(){
  
  
  net.train(get_training_small_data_v2());
}
function getNNResult(input_data){
  var result=net.run(input_data);
  /*
  var g1=result.g1*20;
  var g2=result.g2*20;
  var g3=result.g3*20;
  */
  var g1=result.g1;
  var g2=result.g2;
  var g3=result.g3;
  console.log("good:"+g1+"average:"+g2+"poor:"+g3)
  return category_v2(g1,g2,g3);
}
function category_v2(g1,g2,g3){
  var result;
  if(g1>g2 && g1>g3){
    result= "Good!";
  }else if(g2>g3 && g2>g1){
    result= "Average!";
  }else{
    result= "Poor!";
  }
  result=result+"\n"+"good:"+g1+"average:"+g2+"poor:"+g3;
  return result;
}

function category(value){

  if(value>=14){
    return "Good";
  }else if(value>=7){
    return "Average";
  }else{
    return "Poor";
  }
}
// Start server
// Webhooks must be available via SSL with a certificate signed by a valid 
// certificate authority.
app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});


//post method
//app.use(express.bodyParser());
app.use(bodyParser.urlencoded({
    extended: true
}));


var push_team_1;
var push_team_2;
var push_court;
var ii;
app.post('/', function(req, res){
    console.log('POST /');
    console.dir(req.body);
    //res.writeHead(200, {'Content-Type': 'text/html'});
	console.log(req.body.time);
    //res.end(req.body.time);
	post_time=req.body.time;
	post_date=req.body.date;
	
	
	
	MongoClient.connect("mongodb://140.116.245.243:27017/NCKUVB", function(err, db) {
		
			if(!err) {
				console.log("We are connected mongodb");
				db.collection('match',function(err,collection){
					var temp_all_team = [];
                    var temp_all_court = []; 
					collection.find({}).toArray(function(err,items){
						if(err) throw err;
						
						console.log("post_time:" + post_time);
						console.log("post_date:" + post_date);
						
						for(items_i=0;items_i<=34;items_i ++){
							
							if((post_time == items[items_i].time) && (post_date == items[items_i].date)){
								 
								//console.log(items[items_i].team1);
								//console.log(items[items_i].team2);
								push_team_1=items[items_i].team1;
								push_team_2=items[items_i].team2;
								push_court=items[items_i].court;
								temp_all_team.push(push_team_1);
								temp_all_team.push(push_team_2);
								temp_all_court.push(push_court);
								console.log(temp_all_team);
								console.log(temp_all_court);
								
							}
						}
						
						db.collection('subscription',function(err,collection){
							//console.log(push_team_1);
							//console.log(push_team_2);
							
								collection.find({}).toArray(function(err,items){
									if(err) throw err;
									
									console.log("共有" + temp_all_team.length + "隊");
									
									for(items_i=0;items_i<items.length;items_i ++){
										
										for(ii=0;ii<temp_all_team.length;ii+=2){
											if(temp_all_team[ii] == items[items_i].Name){
												console.log("get_userid:" + items[items_i].User_id);
												get_userid=items[items_i].User_id;
												recipientId=get_userid;
												
												sendTextMessage(recipientId, "訂閱隊伍的下場賽程\n時間:" + post_time +"\n"+"對手:"+team_list[temp_all_team[ii+1]]+"\n"+"場地:"+court_list[temp_all_court[ii/2]] ) ;
											}
											if(temp_all_team[ii] == items[items_i].Name){
												console.log("get_userid:" + items[items_i].User_id);
												get_userid=items[items_i].User_id;
												recipientId=get_userid;
												
												sendTextMessage(recipientId, "訂閱隊伍的下場賽程\n時間:" + post_time +"\n"+"對手:"+team_list[temp_all_team[ii]]+"\n"+"場地:"+court_list[temp_all_court[ii/2]] ) ;
												
																								
											}
										}
									}
								});
							
					
						});
						
						db.close(); //關閉連線
					});
						
				});
			
				
				
			}
	});	
		
		
	
	//推播的USER_ID
	/*recipientId='1344974895618304';
	
	sendTextMessage(recipientId, "訂閱隊伍的下場賽程時間:" + post_time ) ;*/
	
	var website_url="https://bot-web.herokuapp.com/";
	res.redirect(website_url);
});
function get_training_small_data_v2(){
  var training_data=
  [
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:2,p7:4,p8:4,p9:4,p10:1,p11:3,p12:1,p13:2,p14:2,p15:0,p16:1,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:4,p27:1,p28:1,p29:3,p30:4},output:{g1:0,g2:0,g3:1}},
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:2,p7:4,p8:4,p9:4,p10:1,p11:3,p12:1,p13:2,p14:2,p15:0,p16:1,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:4,p27:1,p28:1,p29:3,p30:4},output:{g1:0,g2:0,g3:1}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:3,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:5,p25:3,p26:3,p27:1,p28:1,p29:3,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:5,p12:1,p13:1,p14:2,p15:0,p16:1,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:2,p27:2,p28:3,p29:3,p30:6},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:4,p8:2,p9:2,p10:3,p11:1,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:3,p25:2,p26:2,p27:1,p28:1,p29:5,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:3,p8:3,p9:5,p10:5,p11:1,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:2,p27:1,p28:2,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:3,p9:3,p10:5,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:2,p27:1,p28:2,p29:5,p30:6},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:4,p27:1,p28:1,p29:3,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:2,p7:4,p8:4,p9:5,p10:1,p11:1,p12:1,p13:2,p14:2,p15:0,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:1,p26:4,p27:1,p28:1,p29:1,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:2,p7:3,p8:2,p9:3,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:2,p27:1,p28:1,p29:1,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:3,p8:4,p9:5,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:5,p26:1,p27:1,p28:1,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:2,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:3,p25:3,p26:3,p27:1,p28:2,p29:2,p30:2},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:2,p8:1,p9:3,p10:5,p11:2,p12:2,p13:3,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:2,p26:2,p27:1,p28:1,p29:4,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:2,p10:3,p11:3,p12:2,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:3,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:3,p9:1,p10:5,p11:3,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:3,p27:1,p28:2,p29:3,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:2,p7:2,p8:2,p9:5,p10:5,p11:1,p12:5,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:5,p26:2,p27:1,p28:1,p29:3,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:2,p10:5,p11:1,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:4,p27:1,p28:2,p29:2,p30:6},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:3,p11:2,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:3,p25:2,p26:3,p27:1,p28:2,p29:2,p30:10},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:3,p8:3,p9:5,p10:5,p11:2,p12:1,p13:3,p14:2,p15:0,p16:1,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:5,p25:3,p26:2,p27:1,p28:1,p29:4,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:3,p8:2,p9:3,p10:3,p11:3,p12:1,p13:1,p14:1,p15:3,p16:0,p17:1,p18:1,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:5,p26:5,p27:2,p28:4,p29:5,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:3,p9:2,p10:5,p11:1,p12:2,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:3,p25:1,p26:3,p27:1,p28:3,p29:5,p30:6},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:3,p9:1,p10:5,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:1,p27:1,p28:1,p29:1,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:2,p10:2,p11:5,p12:2,p13:1,p14:1,p15:0,p16:0,p17:1,p18:1,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:2,p27:1,p28:1,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:2,p9:1,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:5,p26:1,p27:1,p28:3,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:4,p27:2,p28:4,p29:5,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:2,p5:3,p6:1,p7:2,p8:4,p9:3,p10:2,p11:3,p12:1,p13:1,p14:3,p15:0,p16:1,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:2,p27:1,p28:1,p29:5,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:3,p11:1,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:1,p25:2,p26:2,p27:1,p28:3,p29:5,p30:6},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:1,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:2,p27:1,p28:2,p29:5,p30:8},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:2,p9:2,p10:3,p11:5,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:2,p25:2,p26:4,p27:2,p28:4,p29:1,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:2,p7:3,p8:4,p9:3,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:1,p17:1,p18:1,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:3,p27:1,p28:1,p29:5,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:1,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:1,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:4,p26:5,p27:5,p28:5,p29:5,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:2,p10:3,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:1,p19:0,p20:0,p21:1,p22:1,p23:0,p24:5,p25:4,p26:2,p27:3,p28:4,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:3,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:1,p27:1,p28:1,p29:5,p30:2},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:2,p5:3,p6:1,p7:4,p8:3,p9:1,p10:4,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:5,p26:2,p27:1,p28:1,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:3,p8:3,p9:5,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:5,p25:3,p26:2,p27:1,p28:1,p29:2,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:3,p8:2,p9:5,p10:5,p11:1,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:5,p25:4,p26:3,p27:1,p28:1,p29:5,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:2,p8:3,p9:5,p10:5,p11:5,p12:2,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:3,p25:5,p26:1,p27:1,p28:1,p29:5,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:3,p9:1,p10:3,p11:1,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:3,p27:1,p28:1,p29:4,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:2,p5:3,p6:2,p7:4,p8:4,p9:5,p10:1,p11:2,p12:1,p13:2,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:2,p25:4,p26:3,p27:1,p28:1,p29:5,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:2,p5:3,p6:1,p7:3,p8:4,p9:3,p10:2,p11:3,p12:1,p13:1,p14:3,p15:0,p16:1,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:2,p27:1,p28:1,p29:5,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:2,p5:3,p6:1,p7:2,p8:2,p9:4,p10:5,p11:2,p12:1,p13:1,p14:1,p15:0,p16:1,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:1,p27:1,p28:1,p29:2,p30:8},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:1,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:1,p24:3,p25:3,p26:3,p27:1,p28:2,p29:3,p30:16},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:5,p11:1,p12:5,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:1,p24:5,p25:4,p26:3,p27:2,p28:4,p29:5,p30:8},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:1,p11:3,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:1,p29:5,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:3,p11:3,p12:2,p13:1,p14:1,p15:0,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:1,p27:1,p28:1,p29:1,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:4,p11:3,p12:2,p13:2,p14:2,p15:1,p16:1,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:2,p28:2,p29:5,p30:14},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:2,p7:4,p8:3,p9:5,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:1,p17:1,p18:1,p19:1,p20:1,p21:1,p22:1,p23:1,p24:5,p25:2,p26:2,p27:1,p28:1,p29:5,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:2,p7:3,p8:3,p9:5,p10:3,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:2,p25:3,p26:5,p27:1,p28:4,p29:3,p30:6},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:3,p9:2,p10:3,p11:2,p12:1,p13:1,p14:4,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:2,p27:1,p28:1,p29:2,p30:2},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:2,p9:1,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:3,p27:2,p28:2,p29:5,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:1,p11:5,p12:2,p13:1,p14:2,p15:0,p16:1,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:4,p25:4,p26:4,p27:1,p28:1,p29:3,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:3,p11:3,p12:1,p13:3,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:2,p28:3,p29:4,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:4,p8:2,p9:2,p10:5,p11:5,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:1,p29:5,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:2,p7:4,p8:2,p9:2,p10:2,p11:5,p12:2,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:5,p25:5,p26:5,p27:3,p28:4,p29:5,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:3,p11:3,p12:1,p13:1,p14:1,p15:0,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:3,p25:3,p26:4,p27:2,p28:3,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:2,p7:3,p8:3,p9:5,p10:5,p11:5,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:4,p27:4,p28:4,p29:1,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:2,p7:2,p8:1,p9:5,p10:5,p11:5,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:5,p25:3,p26:4,p27:1,p28:1,p29:2,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:2,p7:4,p8:3,p9:3,p10:3,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:2,p27:1,p28:1,p29:1,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:2,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:3,p25:2,p26:2,p27:1,p28:1,p29:5,p30:8},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:1,p8:2,p9:5,p10:4,p11:1,p12:2,p13:1,p14:2,p15:0,p16:1,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:2,p27:1,p28:1,p29:5,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:2,p9:3,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:1,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:3,p27:1,p28:1,p29:5,p30:2},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:2,p5:3,p6:1,p7:4,p8:4,p9:2,p10:1,p11:5,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:2,p25:4,p26:4,p27:2,p28:3,p29:4,p30:0},output:{g1:1,g2:0,g3:0}}

];
  return training_data;
}


function get_training_small_data(){
  var training_data=
  [
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:2,p7:4,p8:4,p9:4,p10:1,p11:3,p12:1,p13:2,p14:2,p15:0,p16:1,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:4,p27:1,p28:1,p29:3,p30:4},output:{g1:0,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:2,p7:4,p8:4,p9:4,p10:1,p11:3,p12:1,p13:2,p14:2,p15:0,p16:1,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:4,p27:1,p28:1,p29:3,p30:4},output:{g1:0,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:3,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:5,p25:3,p26:3,p27:1,p28:1,p29:3,p30:2},output:{g1:0.45,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:5,p12:1,p13:1,p14:2,p15:0,p16:1,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:2,p27:2,p28:3,p29:3,p30:6},output:{g1:0.6,g2:0.65,g3:0.6}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:4,p8:2,p9:2,p10:3,p11:1,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:3,p25:2,p26:2,p27:1,p28:1,p29:5,p30:0},output:{g1:0.7,g2:0.7,g3:0.7}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:3,p8:3,p9:5,p10:5,p11:1,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:2,p27:1,p28:2,p29:5,p30:0},output:{g1:0.55,g2:0.65,g3:0.65}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:3,p9:3,p10:5,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:2,p27:1,p28:2,p29:5,p30:6},output:{g1:0.6,g2:0.6,g3:0.65}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:4,p27:1,p28:1,p29:3,p30:0},output:{g1:0.65,g2:0.6,g3:0.65}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:2,p7:4,p8:4,p9:5,p10:1,p11:1,p12:1,p13:2,p14:2,p15:0,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:1,p26:4,p27:1,p28:1,p29:1,p30:2},output:{g1:0.5,g2:0.65,g3:0.65}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:2,p7:3,p8:2,p9:3,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:2,p27:1,p28:1,p29:1,p30:0},output:{g1:0.75,g2:0.8,g3:0.85}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:3,p8:4,p9:5,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:5,p26:1,p27:1,p28:1,p29:5,p30:0},output:{g1:0.6,g2:0.6,g3:0.65}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:2,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:3,p25:3,p26:3,p27:1,p28:2,p29:2,p30:2},output:{g1:0.7,g2:0.7,g3:0.7}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:2,p8:1,p9:3,p10:5,p11:2,p12:2,p13:3,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:2,p26:2,p27:1,p28:1,p29:4,p30:0},output:{g1:0.5,g2:0.6,g3:0.65}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:2,p10:3,p11:3,p12:2,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:3,p29:5,p30:0},output:{g1:0.6,g2:0.65,g3:0.6}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:3,p9:1,p10:5,p11:3,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:3,p27:1,p28:2,p29:3,p30:0},output:{g1:0.6,g2:0.6,g3:0.65}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:2,p7:2,p8:2,p9:5,p10:5,p11:1,p12:5,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:5,p26:2,p27:1,p28:1,p29:3,p30:0},output:{g1:0.7,g2:0.7,g3:0.75}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:2,p10:5,p11:1,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:4,p27:1,p28:2,p29:2,p30:6},output:{g1:0.85,g2:0.85,g3:0.85}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:3,p11:2,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:3,p25:2,p26:3,p27:1,p28:2,p29:2,p30:10},output:{g1:0.65,g2:0.65,g3:0.7}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:3,p8:3,p9:5,p10:5,p11:2,p12:1,p13:3,p14:2,p15:0,p16:1,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:5,p25:3,p26:2,p27:1,p28:1,p29:4,p30:2},output:{g1:0.65,g2:0.7,g3:0.7}},
    {input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:3,p8:2,p9:3,p10:3,p11:3,p12:1,p13:1,p14:1,p15:3,p16:0,p17:1,p18:1,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:5,p26:5,p27:2,p28:4,p29:5,p30:2},output:{g1:0.4,g2:0.4,g3:0.35}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:3,p9:2,p10:5,p11:1,p12:2,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:3,p25:1,p26:3,p27:1,p28:3,p29:5,p30:6},output:{g1:0.6,g2:0.6,g3:0.6}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:3,p9:1,p10:5,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:1,p27:1,p28:1,p29:1,p30:0},output:{g1:0.6,g2:0.65,g3:0.7}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:2,p10:2,p11:5,p12:2,p13:1,p14:1,p15:0,p16:0,p17:1,p18:1,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:2,p27:1,p28:1,p29:5,p30:0},output:{g1:0.55,g2:0.6,g3:0.6}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:2,p9:1,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:5,p26:1,p27:1,p28:3,p29:5,p30:0},output:{g1:0.6,g2:0.65,g3:0.7}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:4,p27:2,p28:4,p29:5,p30:2},output:{g1:0.5,g2:0.5,g3:0.5}},
    {input:{p1:1,p2:1,p3:15,p4:2,p5:3,p6:1,p7:2,p8:4,p9:3,p10:2,p11:3,p12:1,p13:1,p14:3,p15:0,p16:1,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:2,p27:1,p28:1,p29:5,p30:2},output:{g1:0.5,g2:0.55,g3:0.5}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:3,p11:1,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:1,p25:2,p26:2,p27:1,p28:3,p29:5,p30:6},output:{g1:0.5,g2:0.55,g3:0.6}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:1,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:2,p27:1,p28:2,p29:5,p30:8},output:{g1:0.55,g2:0.6,g3:0.6}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:2,p9:2,p10:3,p11:5,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:2,p25:2,p26:4,p27:2,p28:4,p29:1,p30:0},output:{g1:0.55,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:2,p7:3,p8:4,p9:3,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:1,p17:1,p18:1,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:3,p27:1,p28:1,p29:5,p30:2},output:{g1:0.6,g2:0.6,g3:0.65}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:1,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:1,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:4,p26:5,p27:5,p28:5,p29:5,p30:4},output:{g1:0.6,g2:0.55,g3:0.6}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:2,p10:3,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:1,p19:0,p20:0,p21:1,p22:1,p23:0,p24:5,p25:4,p26:2,p27:3,p28:4,p29:5,p30:0},output:{g1:0.5,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:3,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:1,p27:1,p28:1,p29:5,p30:2},output:{g1:0.75,g2:0.75,g3:0.75}},
    {input:{p1:1,p2:2,p3:15,p4:2,p5:3,p6:1,p7:4,p8:3,p9:1,p10:4,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:5,p26:2,p27:1,p28:1,p29:5,p30:0},output:{g1:0.65,g2:0.7,g3:0.75}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:3,p8:3,p9:5,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:5,p25:3,p26:2,p27:1,p28:1,p29:2,p30:0},output:{g1:0.65,g2:0.6,g3:0.6}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:3,p8:2,p9:5,p10:5,p11:1,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:5,p25:4,p26:3,p27:1,p28:1,p29:5,p30:4},output:{g1:0.6,g2:0.6,g3:0.6}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:2,p8:3,p9:5,p10:5,p11:5,p12:2,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:3,p25:5,p26:1,p27:1,p28:1,p29:5,p30:4},output:{g1:0.55,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:3,p9:1,p10:3,p11:1,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:3,p27:1,p28:1,p29:4,p30:0},output:{g1:0.7,g2:0.7,g3:0.7}},
    {input:{p1:1,p2:2,p3:16,p4:2,p5:3,p6:2,p7:4,p8:4,p9:5,p10:1,p11:2,p12:1,p13:2,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:2,p25:4,p26:3,p27:1,p28:1,p29:5,p30:4},output:{g1:0.65,g2:0.65,g3:0.65}},
    {input:{p1:1,p2:1,p3:15,p4:2,p5:3,p6:1,p7:3,p8:4,p9:3,p10:2,p11:3,p12:1,p13:1,p14:3,p15:0,p16:1,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:2,p27:1,p28:1,p29:5,p30:2},output:{g1:0.55,g2:0.6,g3:0.6}},
    {input:{p1:1,p2:1,p3:15,p4:2,p5:3,p6:1,p7:2,p8:2,p9:4,p10:5,p11:2,p12:1,p13:1,p14:1,p15:0,p16:1,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:1,p27:1,p28:1,p29:2,p30:8},output:{g1:0.7,g2:0.65,g3:0.6}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:1,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:1,p24:3,p25:3,p26:3,p27:1,p28:2,p29:3,p30:16},output:{g1:0.55,g2:0.55,g3:0.5}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:5,p11:1,p12:5,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:1,p24:5,p25:4,p26:3,p27:2,p28:4,p29:5,p30:8},output:{g1:0.5,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:1,p11:3,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:1,p29:5,p30:0},output:{g1:0.7,g2:0.75,g3:0.75}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:3,p11:3,p12:2,p13:1,p14:1,p15:0,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:1,p27:1,p28:1,p29:1,p30:0},output:{g1:0.45,g2:0.5,g3:0.5}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:4,p11:3,p12:2,p13:2,p14:2,p15:1,p16:1,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:2,p28:2,p29:5,p30:14},output:{g1:0.5,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:2,p7:4,p8:3,p9:5,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:1,p17:1,p18:1,p19:1,p20:1,p21:1,p22:1,p23:1,p24:5,p25:2,p26:2,p27:1,p28:1,p29:5,p30:4},output:{g1:0.5,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:2,p7:3,p8:3,p9:5,p10:3,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:2,p25:3,p26:5,p27:1,p28:4,p29:3,p30:6},output:{g1:0.65,g2:0.6,g3:0.65}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:3,p9:2,p10:3,p11:2,p12:1,p13:1,p14:4,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:2,p27:1,p28:1,p29:2,p30:2},output:{g1:0.85,g2:0.85,g3:0.85}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:2,p9:1,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:3,p27:2,p28:2,p29:5,p30:4},output:{g1:0.55,g2:0.6,g3:0.65}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:1,p11:5,p12:2,p13:1,p14:2,p15:0,p16:1,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:4,p25:4,p26:4,p27:1,p28:1,p29:3,p30:2},output:{g1:0.65,g2:0.6,g3:0.6}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:3,p11:3,p12:1,p13:3,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:2,p28:3,p29:4,p30:0},output:{g1:0.7,g2:0.65,g3:0.65}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:4,p8:2,p9:2,p10:5,p11:5,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:1,p29:5,p30:0},output:{g1:0.8,g2:0.7,g3:0.8}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:2,p7:4,p8:2,p9:2,p10:2,p11:5,p12:2,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:5,p25:5,p26:5,p27:3,p28:4,p29:5,p30:4},output:{g1:0.5,g2:0.45,g3:0.45}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:3,p11:3,p12:1,p13:1,p14:1,p15:0,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:3,p25:3,p26:4,p27:2,p28:3,p29:5,p30:0},output:{g1:0.65,g2:0.6,g3:0.6}}
  ];
  return training_data;
}

function get_training_data_v2(){
  var training_data=
  [
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:2,p7:4,p8:4,p9:4,p10:1,p11:3,p12:1,p13:2,p14:2,p15:0,p16:1,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:4,p27:1,p28:1,p29:3,p30:4},output:{g1:0,g2:0,g3:1}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:3,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:5,p25:3,p26:3,p27:1,p28:1,p29:3,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:5,p12:1,p13:1,p14:2,p15:0,p16:1,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:2,p27:2,p28:3,p29:3,p30:6},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:4,p8:2,p9:2,p10:3,p11:1,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:3,p25:2,p26:2,p27:1,p28:1,p29:5,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:3,p8:3,p9:5,p10:5,p11:1,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:2,p27:1,p28:2,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:3,p9:3,p10:5,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:2,p27:1,p28:2,p29:5,p30:6},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:4,p27:1,p28:1,p29:3,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:2,p7:4,p8:4,p9:5,p10:1,p11:1,p12:1,p13:2,p14:2,p15:0,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:1,p26:4,p27:1,p28:1,p29:1,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:2,p7:3,p8:2,p9:3,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:2,p27:1,p28:1,p29:1,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:3,p8:4,p9:5,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:5,p26:1,p27:1,p28:1,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:2,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:3,p25:3,p26:3,p27:1,p28:2,p29:2,p30:2},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:2,p8:1,p9:3,p10:5,p11:2,p12:2,p13:3,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:2,p26:2,p27:1,p28:1,p29:4,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:2,p10:3,p11:3,p12:2,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:3,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:3,p9:1,p10:5,p11:3,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:3,p27:1,p28:2,p29:3,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:2,p7:2,p8:2,p9:5,p10:5,p11:1,p12:5,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:5,p26:2,p27:1,p28:1,p29:3,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:2,p10:5,p11:1,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:4,p27:1,p28:2,p29:2,p30:6},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:3,p11:2,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:3,p25:2,p26:3,p27:1,p28:2,p29:2,p30:10},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:3,p8:3,p9:5,p10:5,p11:2,p12:1,p13:3,p14:2,p15:0,p16:1,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:5,p25:3,p26:2,p27:1,p28:1,p29:4,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:3,p8:2,p9:3,p10:3,p11:3,p12:1,p13:1,p14:1,p15:3,p16:0,p17:1,p18:1,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:5,p26:5,p27:2,p28:4,p29:5,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:3,p9:2,p10:5,p11:1,p12:2,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:3,p25:1,p26:3,p27:1,p28:3,p29:5,p30:6},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:3,p9:1,p10:5,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:1,p27:1,p28:1,p29:1,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:2,p10:2,p11:5,p12:2,p13:1,p14:1,p15:0,p16:0,p17:1,p18:1,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:2,p27:1,p28:1,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:2,p9:1,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:5,p26:1,p27:1,p28:3,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:4,p27:2,p28:4,p29:5,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:2,p5:3,p6:1,p7:2,p8:4,p9:3,p10:2,p11:3,p12:1,p13:1,p14:3,p15:0,p16:1,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:2,p27:1,p28:1,p29:5,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:3,p11:1,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:1,p25:2,p26:2,p27:1,p28:3,p29:5,p30:6},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:1,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:2,p27:1,p28:2,p29:5,p30:8},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:2,p9:2,p10:3,p11:5,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:2,p25:2,p26:4,p27:2,p28:4,p29:1,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:2,p7:3,p8:4,p9:3,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:1,p17:1,p18:1,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:3,p27:1,p28:1,p29:5,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:1,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:1,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:4,p26:5,p27:5,p28:5,p29:5,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:2,p10:3,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:1,p19:0,p20:0,p21:1,p22:1,p23:0,p24:5,p25:4,p26:2,p27:3,p28:4,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:3,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:1,p27:1,p28:1,p29:5,p30:2},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:2,p5:3,p6:1,p7:4,p8:3,p9:1,p10:4,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:5,p26:2,p27:1,p28:1,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:3,p8:3,p9:5,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:5,p25:3,p26:2,p27:1,p28:1,p29:2,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:3,p8:2,p9:5,p10:5,p11:1,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:5,p25:4,p26:3,p27:1,p28:1,p29:5,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:2,p8:3,p9:5,p10:5,p11:5,p12:2,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:3,p25:5,p26:1,p27:1,p28:1,p29:5,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:3,p9:1,p10:3,p11:1,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:3,p27:1,p28:1,p29:4,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:2,p5:3,p6:2,p7:4,p8:4,p9:5,p10:1,p11:2,p12:1,p13:2,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:2,p25:4,p26:3,p27:1,p28:1,p29:5,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:2,p5:3,p6:1,p7:3,p8:4,p9:3,p10:2,p11:3,p12:1,p13:1,p14:3,p15:0,p16:1,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:2,p27:1,p28:1,p29:5,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:2,p5:3,p6:1,p7:2,p8:2,p9:4,p10:5,p11:2,p12:1,p13:1,p14:1,p15:0,p16:1,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:1,p27:1,p28:1,p29:2,p30:8},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:1,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:1,p24:3,p25:3,p26:3,p27:1,p28:2,p29:3,p30:16},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:5,p11:1,p12:5,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:1,p24:5,p25:4,p26:3,p27:2,p28:4,p29:5,p30:8},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:1,p11:3,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:1,p29:5,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:3,p11:3,p12:2,p13:1,p14:1,p15:0,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:1,p27:1,p28:1,p29:1,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:4,p11:3,p12:2,p13:2,p14:2,p15:1,p16:1,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:2,p28:2,p29:5,p30:14},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:2,p7:4,p8:3,p9:5,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:1,p17:1,p18:1,p19:1,p20:1,p21:1,p22:1,p23:1,p24:5,p25:2,p26:2,p27:1,p28:1,p29:5,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:2,p7:3,p8:3,p9:5,p10:3,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:2,p25:3,p26:5,p27:1,p28:4,p29:3,p30:6},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:3,p9:2,p10:3,p11:2,p12:1,p13:1,p14:4,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:2,p27:1,p28:1,p29:2,p30:2},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:2,p9:1,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:3,p27:2,p28:2,p29:5,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:1,p11:5,p12:2,p13:1,p14:2,p15:0,p16:1,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:4,p25:4,p26:4,p27:1,p28:1,p29:3,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:3,p11:3,p12:1,p13:3,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:2,p28:3,p29:4,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:4,p8:2,p9:2,p10:5,p11:5,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:1,p29:5,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:2,p7:4,p8:2,p9:2,p10:2,p11:5,p12:2,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:5,p25:5,p26:5,p27:3,p28:4,p29:5,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:3,p11:3,p12:1,p13:1,p14:1,p15:0,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:3,p25:3,p26:4,p27:2,p28:3,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:2,p7:3,p8:3,p9:5,p10:5,p11:5,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:4,p27:4,p28:4,p29:1,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:2,p7:2,p8:1,p9:5,p10:5,p11:5,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:5,p25:3,p26:4,p27:1,p28:1,p29:2,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:2,p7:4,p8:3,p9:3,p10:3,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:2,p27:1,p28:1,p29:1,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:2,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:3,p25:2,p26:2,p27:1,p28:1,p29:5,p30:8},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:1,p8:2,p9:5,p10:4,p11:1,p12:2,p13:1,p14:2,p15:0,p16:1,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:2,p27:1,p28:1,p29:5,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:2,p9:3,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:1,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:3,p27:1,p28:1,p29:5,p30:2},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:2,p5:3,p6:1,p7:4,p8:4,p9:2,p10:1,p11:5,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:2,p25:4,p26:4,p27:2,p28:3,p29:4,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:1,p8:1,p9:3,p10:3,p11:3,p12:2,p13:4,p14:1,p15:0,p16:1,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:1,p24:5,p25:5,p26:5,p27:5,p28:5,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:1,p8:2,p9:5,p10:3,p11:2,p12:2,p13:1,p14:2,p15:0,p16:1,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:3,p27:1,p28:1,p29:1,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:3,p9:1,p10:2,p11:1,p12:1,p13:1,p14:3,p15:0,p16:1,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:3,p25:4,p26:4,p27:2,p28:4,p29:4,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:4,p8:3,p9:3,p10:3,p11:2,p12:2,p13:1,p14:2,p15:0,p16:1,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:4,p26:4,p27:2,p28:4,p29:2,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:3,p9:1,p10:3,p11:3,p12:1,p13:3,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:3,p27:1,p28:2,p29:1,p30:2},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:2,p7:4,p8:4,p9:5,p10:3,p11:2,p12:1,p13:1,p14:4,p15:0,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:1,p24:1,p25:3,p26:3,p27:5,p28:5,p29:3,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:3,p8:1,p9:3,p10:5,p11:3,p12:1,p13:1,p14:4,p15:0,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:2,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:2,p5:3,p6:1,p7:2,p8:2,p9:2,p10:3,p11:2,p12:1,p13:2,p14:2,p15:0,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:1,p26:3,p27:1,p28:3,p29:4,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:2,p5:3,p6:1,p7:3,p8:1,p9:5,p10:5,p11:2,p12:2,p13:2,p14:4,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:4,p25:4,p26:2,p27:2,p28:3,p29:3,p30:6},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:3,p8:1,p9:5,p10:5,p11:2,p12:2,p13:2,p14:4,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:2,p27:1,p28:1,p29:5,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:2,p9:5,p10:5,p11:3,p12:1,p13:1,p14:4,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:3,p25:3,p26:3,p27:1,p28:1,p29:3,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:2,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:2,p12:1,p13:1,p14:2,p15:0,p16:1,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:1,p24:3,p25:3,p26:4,p27:2,p28:4,p29:5,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:3,p8:1,p9:5,p10:5,p11:2,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:5,p25:3,p26:2,p27:2,p28:2,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:3,p8:3,p9:5,p10:3,p11:1,p12:1,p13:1,p14:2,p15:0,p16:1,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:2,p28:4,p29:5,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:3,p9:1,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:2,p28:3,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:0,p9:1,p10:5,p11:3,p12:1,p13:2,p14:4,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:3,p25:4,p26:3,p27:1,p28:1,p29:1,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:2,p12:1,p13:1,p14:4,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:5,p25:2,p26:3,p27:1,p28:3,p29:3,p30:1},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:2,p8:1,p9:5,p10:5,p11:1,p12:1,p13:2,p14:1,p15:3,p16:1,p17:1,p18:0,p19:1,p20:1,p21:0,p22:1,p23:0,p24:4,p25:5,p26:1,p27:1,p28:1,p29:3,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:3,p8:4,p9:4,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:2,p25:4,p26:3,p27:1,p28:2,p29:3,p30:14},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:2,p8:3,p9:5,p10:3,p11:3,p12:2,p13:1,p14:1,p15:0,p16:1,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:1,p24:3,p25:2,p26:2,p27:1,p28:3,p29:3,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:2,p8:3,p9:5,p10:5,p11:1,p12:1,p13:1,p14:3,p15:0,p16:1,p17:0,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:5,p25:3,p26:2,p27:1,p28:2,p29:5,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:3,p8:2,p9:3,p10:5,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:4,p27:1,p28:1,p29:5,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:3,p11:1,p12:1,p13:2,p14:2,p15:0,p16:0,p17:0,p18:1,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:3,p27:1,p28:3,p29:4,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:1,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:4,p25:3,p26:2,p27:2,p28:3,p29:4,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:3,p11:2,p12:2,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:4,p26:4,p27:2,p28:3,p29:5,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:4,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:4,p27:1,p28:2,p29:2,p30:6},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:4,p8:2,p9:5,p10:5,p11:2,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:3,p27:1,p28:3,p29:1,p30:4},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:5,p11:2,p12:2,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:4,p25:4,p26:2,p27:1,p28:1,p29:3,p30:6},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:2,p7:4,p8:4,p9:1,p10:2,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:1,p26:3,p27:3,p28:5,p29:5,p30:6},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:3,p8:3,p9:5,p10:5,p11:1,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:3,p27:1,p28:3,p29:4,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:4,p8:3,p9:3,p10:5,p11:2,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:5,p26:5,p27:1,p28:3,p29:1,p30:6},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:3,p8:1,p9:5,p10:5,p11:1,p12:2,p13:1,p14:2,p15:0,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:3,p25:3,p26:3,p27:2,p28:3,p29:2,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:2,p9:1,p10:3,p11:1,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:3,p27:1,p28:1,p29:1,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:2,p11:2,p12:1,p13:1,p14:4,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:4,p27:1,p28:1,p29:4,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:1,p12:1,p13:2,p14:4,p15:0,p16:1,p17:1,p18:1,p19:1,p20:1,p21:1,p22:1,p23:0,p24:3,p25:1,p26:2,p27:1,p28:1,p29:1,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:2,p5:3,p6:1,p7:4,p8:3,p9:3,p10:5,p11:2,p12:1,p13:2,p14:1,p15:0,p16:1,p17:1,p18:1,p19:1,p20:0,p21:1,p22:1,p23:0,p24:3,p25:3,p26:3,p27:1,p28:1,p29:4,p30:6},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:1,p9:5,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:1,p24:4,p25:3,p26:5,p27:1,p28:1,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:5,p10:5,p11:2,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:5,p25:3,p26:4,p27:1,p28:2,p29:1,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:3,p9:5,p10:4,p11:3,p12:1,p13:1,p14:3,p15:0,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:5,p27:1,p28:1,p29:3,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:3,p11:5,p12:1,p13:1,p14:1,p15:0,p16:1,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:5,p26:5,p27:5,p28:5,p29:4,p30:12},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:1,p11:5,p12:2,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:4,p26:3,p27:1,p28:1,p29:4,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:5,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:1,p19:1,p20:0,p21:1,p22:1,p23:0,p24:5,p25:3,p26:3,p27:1,p28:1,p29:5,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:3,p8:2,p9:3,p10:5,p11:1,p12:1,p13:2,p14:2,p15:0,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:5,p27:1,p28:1,p29:2,p30:16},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:2,p7:3,p8:4,p9:3,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:4,p27:1,p28:1,p29:1,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:2,p7:3,p8:3,p9:5,p10:2,p11:2,p12:2,p13:1,p14:4,p15:0,p16:1,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:3,p27:1,p28:1,p29:4,p30:10},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:3,p12:1,p13:1,p14:4,p15:0,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:1,p26:2,p27:1,p28:1,p29:3,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:3,p8:3,p9:3,p10:5,p11:1,p12:2,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:3,p27:1,p28:1,p29:5,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:2,p5:3,p6:1,p7:4,p8:4,p9:5,p10:5,p11:1,p12:2,p13:4,p14:4,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:1,p25:3,p26:5,p27:3,p28:5,p29:1,p30:8},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:2,p10:2,p11:5,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:5,p25:4,p26:5,p27:1,p28:1,p29:4,p30:2},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:2,p7:4,p8:4,p9:1,p10:1,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:5,p26:3,p27:1,p28:1,p29:4,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:2,p5:3,p6:1,p7:3,p8:3,p9:3,p10:5,p11:2,p12:2,p13:1,p14:3,p15:0,p16:1,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:1,p26:2,p27:1,p28:1,p29:2,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:4,p10:5,p11:1,p12:1,p13:1,p14:2,p15:1,p16:1,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:3,p25:1,p26:2,p27:1,p28:1,p29:5,p30:12},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:2,p9:1,p10:5,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:3,p25:5,p26:2,p27:1,p28:1,p29:3,p30:10},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:2,p5:3,p6:1,p7:2,p8:1,p9:2,p10:3,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:5,p25:4,p26:2,p27:1,p28:1,p29:5,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:1,p11:3,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:4,p27:1,p28:2,p29:5,p30:6},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:5,p10:1,p11:2,p12:2,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:4,p25:4,p26:3,p27:1,p28:1,p29:2,p30:4},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:3,p8:3,p9:5,p10:3,p11:1,p12:2,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:2,p27:1,p28:1,p29:5,p30:6},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:2,p5:3,p6:1,p7:1,p8:3,p9:5,p10:5,p11:3,p12:2,p13:3,p14:2,p15:1,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:2,p26:4,p27:1,p28:4,p29:5,p30:14},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:3,p8:4,p9:5,p10:5,p11:2,p12:2,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:3,p25:4,p26:3,p27:1,p28:2,p29:4,p30:2},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:1,p8:2,p9:4,p10:3,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:3,p25:2,p26:3,p27:1,p28:2,p29:1,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:3,p11:1,p12:2,p13:1,p14:4,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:5,p26:4,p27:1,p28:2,p29:5,p30:6},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:4,p9:5,p10:2,p11:3,p12:2,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:2,p26:2,p27:1,p28:2,p29:5,p30:2},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:2,p10:5,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:3,p25:4,p26:4,p27:1,p28:4,p29:5,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:5,p25:4,p26:4,p27:1,p28:1,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:3,p8:4,p9:3,p10:3,p11:1,p12:2,p13:1,p14:1,p15:0,p16:1,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:5,p26:5,p27:3,p28:2,p29:5,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:2,p7:3,p8:4,p9:5,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:1,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:5,p25:3,p26:2,p27:1,p28:1,p29:1,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:19,p4:1,p5:3,p6:1,p7:0,p8:1,p9:4,p10:5,p11:3,p12:5,p13:1,p14:2,p15:2,p16:0,p17:1,p18:0,p19:0,p20:0,p21:0,p22:0,p23:0,p24:3,p25:4,p26:2,p27:1,p28:1,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:2,p5:3,p6:1,p7:4,p8:4,p9:1,p10:1,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:3,p25:5,p26:5,p27:2,p28:5,p29:4,p30:8},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:2,p8:3,p9:5,p10:5,p11:3,p12:1,p13:2,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:1,p24:3,p25:2,p26:3,p27:2,p28:2,p29:1,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:2,p5:3,p6:1,p7:3,p8:4,p9:3,p10:1,p11:3,p12:2,p13:2,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:2,p26:2,p27:2,p28:2,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:2,p8:1,p9:3,p10:5,p11:2,p12:1,p13:1,p14:2,p15:3,p16:0,p17:1,p18:0,p19:1,p20:1,p21:0,p22:1,p23:1,p24:5,p25:4,p26:5,p27:1,p28:3,p29:5,p30:10},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:2,p7:2,p8:1,p9:5,p10:5,p11:3,p12:1,p13:3,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:3,p25:2,p26:2,p27:1,p28:2,p29:5,p30:8},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:3,p12:1,p13:3,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:1,p24:4,p25:3,p26:3,p27:1,p28:2,p29:4,p30:6},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:3,p12:2,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:3,p25:4,p26:4,p27:1,p28:3,p29:5,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:2,p7:3,p8:4,p9:3,p10:5,p11:3,p12:2,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:3,p25:2,p26:1,p27:1,p28:4,p29:5,p30:12},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:2,p8:1,p9:4,p10:5,p11:3,p12:1,p13:4,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:3,p25:2,p26:1,p27:1,p28:1,p29:2,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:2,p7:2,p8:2,p9:5,p10:5,p11:1,p12:1,p13:1,p14:1,p15:1,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:5,p25:3,p26:4,p27:1,p28:1,p29:5,p30:12},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:2,p5:3,p6:1,p7:3,p8:4,p9:4,p10:1,p11:3,p12:1,p13:4,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:1,p24:5,p25:3,p26:3,p27:1,p28:1,p29:5,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:4,p11:3,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:3,p27:1,p28:1,p29:5,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:2,p5:3,p6:1,p7:3,p8:4,p9:4,p10:5,p11:3,p12:1,p13:3,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:5,p25:4,p26:5,p27:2,p28:4,p29:5,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:3,p12:1,p13:4,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:5,p25:1,p26:3,p27:1,p28:1,p29:3,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:3,p8:1,p9:3,p10:3,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:3,p25:3,p26:4,p27:4,p28:5,p29:4,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:2,p7:3,p8:2,p9:5,p10:3,p11:3,p12:5,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:1,p24:4,p25:3,p26:3,p27:5,p28:1,p29:5,p30:10},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:2,p5:3,p6:1,p7:1,p8:1,p9:5,p10:3,p11:2,p12:1,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:1,p24:3,p25:3,p26:3,p27:1,p28:2,p29:1,p30:8},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:2,p7:3,p8:3,p9:5,p10:5,p11:3,p12:5,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:1,p24:4,p25:3,p26:2,p27:1,p28:1,p29:5,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:1,p8:1,p9:3,p10:5,p11:3,p12:1,p13:1,p14:2,p15:2,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:1,p24:4,p25:4,p26:4,p27:1,p28:3,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:1,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:2,p27:1,p28:1,p29:5,p30:6},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:2,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:3,p12:1,p13:3,p14:1,p15:1,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:5,p25:5,p26:5,p27:1,p28:1,p29:1,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:3,p9:1,p10:3,p11:3,p12:2,p13:2,p14:4,p15:0,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:2,p25:2,p26:2,p27:1,p28:1,p29:3,p30:6},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:2,p7:3,p8:3,p9:3,p10:3,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:0,p21:1,p22:0,p23:1,p24:1,p25:3,p26:2,p27:2,p28:3,p29:1,p30:24},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:3,p11:3,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:3,p27:1,p28:3,p29:5,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:3,p11:2,p12:2,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:2,p25:3,p26:3,p27:2,p28:2,p29:2,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:3,p11:3,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:2,p27:1,p28:1,p29:5,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:1,p8:1,p9:4,p10:4,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:3,p25:4,p26:4,p27:3,p28:3,p29:1,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:2,p8:1,p9:5,p10:5,p11:1,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:5,p27:1,p28:2,p29:5,p30:22},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:3,p11:3,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:2,p27:1,p28:2,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:2,p7:2,p8:1,p9:4,p10:5,p11:1,p12:1,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:0,p22:1,p23:1,p24:4,p25:4,p26:2,p27:1,p28:1,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:3,p8:2,p9:2,p10:3,p11:1,p12:2,p13:1,p14:2,p15:1,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:3,p25:3,p26:2,p27:1,p28:1,p29:3,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:1,p8:2,p9:4,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:4,p25:3,p26:2,p27:1,p28:1,p29:5,p30:6},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:1,p8:2,p9:4,p10:3,p11:3,p12:2,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:0,p21:1,p22:0,p23:1,p24:2,p25:3,p26:4,p27:2,p28:4,p29:1,p30:6},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:1,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:0,p22:1,p23:1,p24:3,p25:3,p26:2,p27:2,p28:1,p29:5,p30:16},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:2,p7:2,p8:1,p9:3,p10:5,p11:3,p12:1,p13:4,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:5,p26:5,p27:2,p28:5,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:3,p12:1,p13:1,p14:1,p15:2,p16:0,p17:0,p18:0,p19:0,p20:1,p21:0,p22:1,p23:1,p24:2,p25:3,p26:5,p27:2,p28:5,p29:4,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:2,p8:1,p9:4,p10:5,p11:3,p12:1,p13:1,p14:1,p15:1,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:0,p23:1,p24:4,p25:4,p26:4,p27:3,p28:5,p29:5,p30:6},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:15,p4:2,p5:3,p6:1,p7:3,p8:3,p9:3,p10:3,p11:2,p12:5,p13:2,p14:3,p15:0,p16:0,p17:1,p18:1,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:2,p26:1,p27:2,p28:3,p29:3,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:19,p4:1,p5:3,p6:1,p7:3,p8:2,p9:3,p10:4,p11:1,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:0,p22:1,p23:1,p24:4,p25:5,p26:4,p27:1,p28:1,p29:4,p30:6},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:4,p8:4,p9:5,p10:1,p11:3,p12:1,p13:1,p14:1,p15:0,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:1,p24:4,p25:2,p26:1,p27:1,p28:1,p29:4,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:2,p5:3,p6:1,p7:2,p8:3,p9:4,p10:3,p11:3,p12:1,p13:1,p14:2,p15:0,p16:1,p17:0,p18:1,p19:1,p20:1,p21:1,p22:0,p23:0,p24:4,p25:4,p26:4,p27:1,p28:1,p29:1,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:2,p5:3,p6:1,p7:1,p8:2,p9:5,p10:5,p11:2,p12:1,p13:1,p14:1,p15:3,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:2,p25:2,p26:2,p27:3,p28:3,p29:5,p30:14},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:3,p12:1,p13:3,p14:1,p15:3,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:0,p23:0,p24:5,p25:2,p26:5,p27:1,p28:5,p29:4,p30:6},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:2,p5:3,p6:1,p7:2,p8:2,p9:4,p10:5,p11:3,p12:1,p13:3,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:0,p21:1,p22:0,p23:0,p24:4,p25:2,p26:2,p27:1,p28:2,p29:3,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:3,p8:3,p9:5,p10:3,p11:3,p12:2,p13:1,p14:2,p15:1,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:5,p26:5,p27:4,p28:4,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:1,p8:2,p9:2,p10:3,p11:3,p12:1,p13:2,p14:1,p15:2,p16:0,p17:0,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:4,p25:4,p26:5,p27:3,p28:5,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:2,p5:3,p6:1,p7:2,p8:1,p9:4,p10:5,p11:3,p12:1,p13:2,p14:1,p15:1,p16:0,p17:0,p18:1,p19:1,p20:1,p21:0,p22:1,p23:1,p24:3,p25:3,p26:2,p27:2,p28:2,p29:5,p30:8},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:2,p5:3,p6:1,p7:3,p8:2,p9:5,p10:5,p11:3,p12:1,p13:2,p14:2,p15:2,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:4,p26:4,p27:1,p28:4,p29:3,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:1,p8:2,p9:5,p10:5,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:4,p25:4,p26:4,p27:2,p28:4,p29:5,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:1,p8:3,p9:4,p10:3,p11:3,p12:2,p13:1,p14:1,p15:1,p16:0,p17:0,p18:0,p19:0,p20:1,p21:0,p22:1,p23:0,p24:5,p25:3,p26:3,p27:1,p28:4,p29:2,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:2,p5:3,p6:1,p7:1,p8:1,p9:5,p10:3,p11:3,p12:1,p13:4,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:0,p22:0,p23:1,p24:5,p25:3,p26:5,p27:1,p28:5,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:3,p8:2,p9:3,p10:3,p11:3,p12:1,p13:2,p14:1,p15:3,p16:0,p17:1,p18:0,p19:1,p20:0,p21:0,p22:0,p23:0,p24:4,p25:5,p26:2,p27:1,p28:1,p29:2,p30:10},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:3,p12:2,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:0,p22:1,p23:0,p24:4,p25:3,p26:5,p27:2,p28:4,p29:4,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:2,p9:2,p10:3,p11:1,p12:2,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:2,p26:3,p27:1,p28:1,p29:3,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:5,p25:1,p26:5,p27:1,p28:1,p29:4,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:2,p10:2,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:4,p26:2,p27:1,p28:1,p29:3,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:3,p8:4,p9:5,p10:5,p11:3,p12:2,p13:3,p14:1,p15:1,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:3,p25:4,p26:5,p27:2,p28:4,p29:2,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:1,p8:0,p9:5,p10:5,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:2,p27:1,p28:1,p29:3,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:5,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:4,p27:1,p28:3,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:1,p8:3,p9:4,p10:3,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:1,p23:1,p24:4,p25:3,p26:5,p27:1,p28:1,p29:3,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:3,p8:3,p9:5,p10:5,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:5,p27:1,p28:1,p29:4,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:4,p8:3,p9:1,p10:5,p11:3,p12:1,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:4,p27:4,p28:4,p29:4,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:5,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:3,p25:4,p26:4,p27:1,p28:4,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:3,p8:3,p9:5,p10:5,p11:2,p12:2,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:4,p25:3,p26:4,p27:1,p28:4,p29:4,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:2,p5:3,p6:1,p7:4,p8:2,p9:1,p10:3,p11:5,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:3,p27:3,p28:4,p29:3,p30:8},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:4,p8:3,p9:5,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:1,p19:1,p20:1,p21:1,p22:1,p23:1,p24:5,p25:2,p26:3,p27:1,p28:1,p29:2,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:3,p9:1,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:1,p19:1,p20:1,p21:1,p22:1,p23:0,p24:3,p25:4,p26:3,p27:2,p28:3,p29:3,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:3,p8:3,p9:3,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:2,p26:3,p27:1,p28:2,p29:3,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:2,p8:4,p9:3,p10:3,p11:2,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:5,p25:4,p26:2,p27:2,p28:3,p29:5,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:3,p8:3,p9:5,p10:5,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:5,p25:3,p26:3,p27:2,p28:3,p29:1,p30:32},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:3,p8:2,p9:5,p10:5,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:1,p25:2,p26:2,p27:1,p28:2,p29:1,p30:8},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:3,p8:3,p9:3,p10:3,p11:5,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:4,p27:2,p28:3,p29:4,p30:6},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:1,p8:2,p9:3,p10:3,p11:5,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:3,p25:3,p26:3,p27:1,p28:2,p29:3,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:2,p8:1,p9:5,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:2,p26:3,p27:1,p28:2,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:2,p7:3,p8:3,p9:2,p10:5,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:1,p24:3,p25:3,p26:3,p27:1,p28:3,p29:3,p30:10},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:2,p5:3,p6:1,p7:1,p8:2,p9:4,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:3,p25:1,p26:3,p27:1,p28:5,p29:3,p30:6},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:3,p9:3,p10:3,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:1,p29:2,p30:6},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:1,p8:1,p9:4,p10:3,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:3,p27:1,p28:1,p29:3,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:1,p8:2,p9:4,p10:3,p11:5,p12:5,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:4,p25:4,p26:4,p27:4,p28:5,p29:5,p30:16},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:2,p5:3,p6:1,p7:3,p8:3,p9:3,p10:3,p11:2,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:2,p27:3,p28:4,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:2,p8:3,p9:5,p10:5,p11:1,p12:2,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:3,p27:1,p28:1,p29:3,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:2,p8:4,p9:3,p10:3,p11:3,p12:2,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:2,p27:1,p28:1,p29:5,p30:8},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:1,p11:1,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:2,p26:3,p27:1,p28:2,p29:5,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:2,p5:3,p6:1,p7:3,p8:3,p9:1,p10:5,p11:1,p12:2,p13:3,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:3,p25:3,p26:4,p27:3,p28:5,p29:3,p30:16},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:1,p11:1,p12:1,p13:2,p14:1,p15:1,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:4,p27:2,p28:3,p29:2,p30:30},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:1,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:5,p26:2,p27:1,p28:2,p29:3,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:3,p9:2,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:5,p27:1,p28:5,p29:2,p30:2},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:3,p9:5,p10:5,p11:2,p12:1,p13:1,p14:2,p15:0,p16:1,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:4,p25:4,p26:3,p27:1,p28:3,p29:4,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:0,p23:0,p24:4,p25:4,p26:4,p27:1,p28:3,p29:1,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:2,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:2,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:2,p27:1,p28:2,p29:3,p30:21},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:2,p5:3,p6:1,p7:2,p8:2,p9:3,p10:3,p11:2,p12:1,p13:2,p14:4,p15:0,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:5,p25:3,p26:5,p27:1,p28:1,p29:5,p30:6},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:3,p8:4,p9:4,p10:3,p11:1,p12:1,p13:1,p14:3,p15:1,p16:0,p17:1,p18:1,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:4,p26:3,p27:3,p28:4,p29:5,p30:14},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:2,p7:3,p8:1,p9:3,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:2,p25:3,p26:3,p27:2,p28:2,p29:4,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:3,p9:1,p10:5,p11:5,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:1,p25:3,p26:2,p27:1,p28:1,p29:1,p30:4},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:1,p12:1,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:2,p27:1,p28:4,p29:5,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:2,p5:3,p6:1,p7:4,p8:3,p9:1,p10:5,p11:2,p12:1,p13:2,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:4,p26:2,p27:1,p28:1,p29:4,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:19,p4:1,p5:3,p6:1,p7:3,p8:3,p9:5,p10:5,p11:2,p12:5,p13:1,p14:4,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:2,p29:3,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:5,p25:3,p26:5,p27:4,p28:5,p29:3,p30:15},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:2,p7:2,p8:2,p9:5,p10:5,p11:2,p12:1,p13:1,p14:2,p15:0,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:3,p25:3,p26:4,p27:1,p28:1,p29:4,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:4,p27:2,p28:4,p29:5,p30:10},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:2,p5:3,p6:1,p7:4,p8:4,p9:3,p10:5,p11:5,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:5,p25:2,p26:1,p27:1,p28:2,p29:3,p30:6},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:3,p8:2,p9:5,p10:5,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:4,p27:1,p28:3,p29:1,p30:2},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:4,p8:3,p9:5,p10:5,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:3,p25:4,p26:5,p27:2,p28:4,p29:1,p30:16},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:3,p8:3,p9:3,p10:2,p11:1,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:3,p25:2,p26:4,p27:2,p28:4,p29:4,p30:10},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:2,p8:3,p9:4,p10:5,p11:1,p12:2,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:3,p25:3,p26:3,p27:1,p28:4,p29:3,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:2,p8:2,p9:4,p10:4,p11:3,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:1,p29:4,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:2,p5:3,p6:1,p7:2,p8:1,p9:4,p10:3,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:5,p27:1,p28:2,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:2,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:1,p24:4,p25:3,p26:4,p27:1,p28:1,p29:5,p30:12},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:3,p9:3,p10:1,p11:5,p12:1,p13:1,p14:2,p15:0,p16:1,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:2,p25:3,p26:1,p27:1,p28:1,p29:3,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:1,p12:1,p13:2,p14:2,p15:3,p16:0,p17:1,p18:1,p19:0,p20:1,p21:1,p22:1,p23:0,p24:3,p25:3,p26:3,p27:5,p28:5,p29:4,p30:9},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:3,p11:1,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:5,p25:3,p26:2,p27:1,p28:1,p29:5,p30:4},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:2,p5:3,p6:1,p7:3,p8:1,p9:5,p10:5,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:5,p25:3,p26:3,p27:1,p28:1,p29:4,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:3,p8:2,p9:5,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:5,p25:3,p26:4,p27:1,p28:3,p29:3,p30:2},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:2,p8:3,p9:3,p10:3,p11:2,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:5,p25:3,p26:3,p27:1,p28:3,p29:3,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:2,p8:1,p9:4,p10:5,p11:3,p12:1,p13:4,p14:2,p15:0,p16:1,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:2,p27:4,p28:5,p29:3,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:2,p7:2,p8:1,p9:5,p10:5,p11:3,p12:1,p13:2,p14:3,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:3,p25:2,p26:3,p27:1,p28:2,p29:3,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:4,p8:3,p9:2,p10:5,p11:2,p12:2,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:3,p25:2,p26:3,p27:1,p28:2,p29:3,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:2,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:3,p12:2,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:5,p26:2,p27:1,p28:1,p29:1,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:1,p11:2,p12:1,p13:1,p14:2,p15:0,p16:1,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:5,p26:5,p27:1,p28:3,p29:2,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:2,p10:5,p11:2,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:4,p27:2,p28:4,p29:1,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:1,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:3,p25:4,p26:2,p27:1,p28:1,p29:5,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:3,p8:2,p9:4,p10:5,p11:2,p12:1,p13:2,p14:3,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:5,p25:3,p26:3,p27:1,p28:3,p29:2,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:1,p12:2,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:1,p23:1,p24:4,p25:4,p26:2,p27:5,p28:5,p29:4,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:1,p9:5,p10:5,p11:1,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:5,p26:2,p27:1,p28:1,p29:5,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:2,p7:4,p8:1,p9:5,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:5,p25:3,p26:3,p27:1,p28:2,p29:5,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:2,p7:2,p8:4,p9:3,p10:5,p11:3,p12:1,p13:2,p14:2,p15:1,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:1,p29:3,p30:18},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:2,p8:2,p9:4,p10:3,p11:3,p12:1,p13:1,p14:2,p15:1,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:1,p24:5,p25:3,p26:1,p27:1,p28:1,p29:5,p30:16},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:3,p8:3,p9:5,p10:5,p11:3,p12:1,p13:2,p14:1,p15:1,p16:0,p17:0,p18:0,p19:0,p20:1,p21:0,p22:1,p23:0,p24:4,p25:1,p26:1,p27:1,p28:1,p29:3,p30:14},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:4,p11:3,p12:5,p13:1,p14:1,p15:1,p16:0,p17:1,p18:0,p19:1,p20:0,p21:0,p22:1,p23:1,p24:4,p25:4,p26:3,p27:2,p28:2,p29:1,p30:26},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:1,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:4,p25:2,p26:1,p27:1,p28:2,p29:5,p30:6},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:3,p8:2,p9:5,p10:5,p11:3,p12:2,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:5,p25:4,p26:2,p27:1,p28:1,p29:3,p30:4},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:1,p8:1,p9:4,p10:4,p11:3,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:2,p27:1,p28:2,p29:4,p30:10},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:1,p8:2,p9:5,p10:5,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:0,p22:1,p23:0,p24:5,p25:3,p26:5,p27:1,p28:2,p29:5,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:2,p5:3,p6:1,p7:2,p8:1,p9:4,p10:3,p11:3,p12:1,p13:3,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:2,p25:1,p26:1,p27:1,p28:1,p29:3,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:2,p5:3,p6:2,p7:1,p8:4,p9:5,p10:5,p11:3,p12:5,p13:4,p14:1,p15:1,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:5,p26:4,p27:1,p28:1,p29:5,p30:14},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:3,p11:2,p12:2,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:0,p22:1,p23:0,p24:5,p25:5,p26:4,p27:3,p28:5,p29:2,p30:16},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:2,p7:2,p8:2,p9:5,p10:5,p11:1,p12:1,p13:1,p14:1,p15:1,p16:0,p17:1,p18:0,p19:0,p20:0,p21:0,p22:1,p23:0,p24:3,p25:1,p26:2,p27:1,p28:1,p29:1,p30:8},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:3,p12:1,p13:2,p14:3,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:3,p29:5,p30:4},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:2,p7:4,p8:2,p9:1,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:2,p27:1,p28:1,p29:4,p30:4},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:4,p8:3,p9:2,p10:5,p11:3,p12:1,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:2,p25:5,p26:5,p27:1,p28:4,p29:5,p30:8},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:2,p5:3,p6:2,p7:4,p8:4,p9:1,p10:5,p11:3,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:3,p25:3,p26:3,p27:2,p28:3,p29:4,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:3,p9:1,p10:5,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:5,p25:4,p26:5,p27:1,p28:1,p29:3,p30:7},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:3,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:1,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:2,p27:1,p28:2,p29:5,p30:4},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:3,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:1,p19:0,p20:1,p21:1,p22:1,p23:1,p24:5,p25:3,p26:1,p27:1,p28:4,p29:5,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:2,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:1,p12:2,p13:2,p14:3,p15:0,p16:0,p17:0,p18:0,p19:0,p20:0,p21:1,p22:1,p23:1,p24:4,p25:3,p26:3,p27:1,p28:1,p29:1,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:3,p8:3,p9:3,p10:5,p11:1,p12:1,p13:2,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:2,p26:2,p27:2,p28:3,p29:5,p30:10},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:1,p17:0,p18:0,p19:0,p20:0,p21:1,p22:0,p23:1,p24:4,p25:3,p26:2,p27:1,p28:1,p29:4,p30:10},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:2,p8:1,p9:5,p10:5,p11:3,p12:5,p13:2,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:1,p24:4,p25:4,p26:4,p27:1,p28:1,p29:3,p30:10},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:2,p8:1,p9:5,p10:5,p11:3,p12:1,p13:3,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:1,p29:4,p30:7},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:3,p11:3,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:4,p27:1,p28:2,p29:5,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:2,p8:3,p9:5,p10:5,p11:3,p12:2,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:2,p26:2,p27:1,p28:1,p29:2,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:22,p4:1,p5:3,p6:1,p7:3,p8:1,p9:3,p10:3,p11:5,p12:1,p13:1,p14:1,p15:3,p16:0,p17:0,p18:0,p19:0,p20:0,p21:0,p22:1,p23:1,p24:5,p25:4,p26:5,p27:5,p28:5,p29:1,p30:12},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:18,p4:2,p5:3,p6:1,p7:3,p8:3,p9:5,p10:3,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:3,p27:1,p28:3,p29:5,p30:8},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:0,p8:2,p9:5,p10:5,p11:5,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:4,p25:3,p26:2,p27:2,p28:4,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:3,p8:2,p9:3,p10:5,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:0,p22:1,p23:0,p24:4,p25:4,p26:5,p27:2,p28:4,p29:5,p30:8},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:3,p8:3,p9:4,p10:5,p11:2,p12:5,p13:3,p14:2,p15:1,p16:1,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:5,p25:3,p26:3,p27:1,p28:3,p29:2,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:2,p8:1,p9:3,p10:3,p11:5,p12:1,p13:1,p14:1,p15:2,p16:0,p17:0,p18:0,p19:0,p20:0,p21:0,p22:1,p23:0,p24:3,p25:2,p26:5,p27:2,p28:5,p29:5,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:16,p4:2,p5:3,p6:1,p7:2,p8:1,p9:5,p10:5,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:0,p23:0,p24:3,p25:3,p26:2,p27:1,p28:3,p29:3,p30:2},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:2,p5:3,p6:1,p7:2,p8:1,p9:5,p10:5,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:4,p25:4,p26:2,p27:2,p28:4,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:1,p8:1,p9:2,p10:5,p11:3,p12:1,p13:2,p14:1,p15:1,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:4,p27:1,p28:2,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:2,p7:2,p8:1,p9:5,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:1,p24:4,p25:3,p26:4,p27:1,p28:3,p29:5,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:4,p8:2,p9:1,p10:3,p11:2,p12:1,p13:1,p14:4,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:3,p27:1,p28:1,p29:4,p30:2},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:19,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:3,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:1,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:2,p8:1,p9:3,p10:5,p11:3,p12:1,p13:3,p14:2,p15:1,p16:0,p17:0,p18:0,p19:1,p20:0,p21:0,p22:1,p23:0,p24:4,p25:4,p26:5,p27:4,p28:4,p29:5,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:2,p5:3,p6:1,p7:4,p8:2,p9:5,p10:5,p11:3,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:4,p27:1,p28:3,p29:5,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:4,p11:1,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:0,p23:0,p24:4,p25:4,p26:3,p27:2,p28:3,p29:3,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:2,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:1,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:3,p25:2,p26:3,p27:1,p28:1,p29:5,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:19,p4:1,p5:3,p6:2,p7:4,p8:3,p9:3,p10:4,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:1,p27:1,p28:1,p29:1,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:2,p8:1,p9:5,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:2,p26:4,p27:1,p28:2,p29:4,p30:2},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:2,p5:3,p6:1,p7:2,p8:2,p9:5,p10:3,p11:5,p12:1,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:0,p21:0,p22:0,p23:0,p24:5,p25:2,p26:2,p27:1,p28:1,p29:4,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:3,p11:3,p12:2,p13:1,p14:4,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:3,p25:4,p26:1,p27:1,p28:1,p29:2,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:20,p4:2,p5:3,p6:1,p7:2,p8:1,p9:5,p10:5,p11:3,p12:5,p13:2,p14:2,p15:0,p16:0,p17:1,p18:1,p19:1,p20:1,p21:0,p22:1,p23:1,p24:1,p25:2,p26:3,p27:1,p28:2,p29:2,p30:8},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:4,p8:3,p9:3,p10:5,p11:1,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:3,p25:1,p26:2,p27:1,p28:3,p29:2,p30:2},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:4,p8:3,p9:1,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:4,p25:3,p26:2,p27:1,p28:1,p29:3,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:18,p4:2,p5:3,p6:1,p7:3,p8:2,p9:5,p10:5,p11:3,p12:1,p13:1,p14:3,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:0,p23:0,p24:5,p25:3,p26:2,p27:1,p28:1,p29:3,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:3,p8:3,p9:5,p10:5,p11:1,p12:1,p13:1,p14:3,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:0,p23:0,p24:3,p25:2,p26:3,p27:1,p28:1,p29:4,p30:2},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:2,p8:2,p9:4,p10:3,p11:1,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:3,p27:1,p28:1,p29:3,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:1,p12:2,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:0,p22:1,p23:0,p24:4,p25:4,p26:4,p27:2,p28:3,p29:4,p30:8},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:18,p4:2,p5:3,p6:2,p7:3,p8:4,p9:5,p10:5,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:5,p27:3,p28:4,p29:1,p30:6},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:3,p8:1,p9:3,p10:5,p11:5,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:5,p25:4,p26:4,p27:3,p28:4,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:2,p5:3,p6:1,p7:4,p8:4,p9:1,p10:5,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:4,p27:2,p28:2,p29:4,p30:8},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:4,p8:2,p9:2,p10:5,p11:2,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:5,p25:4,p26:5,p27:1,p28:3,p29:5,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:2,p5:3,p6:1,p7:2,p8:1,p9:5,p10:5,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:0,p22:1,p23:1,p24:4,p25:3,p26:5,p27:1,p28:2,p29:3,p30:12},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:19,p4:1,p5:3,p6:1,p7:3,p8:3,p9:5,p10:3,p11:1,p12:5,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:5,p27:3,p28:3,p29:5,p30:16},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:2,p8:3,p9:5,p10:3,p11:2,p12:2,p13:1,p14:4,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:5,p26:5,p27:1,p28:3,p29:2,p30:10},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:1,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:0,p23:0,p24:4,p25:4,p26:3,p27:1,p28:1,p29:3,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:2,p5:3,p6:1,p7:1,p8:2,p9:4,p10:4,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:0,p23:1,p24:3,p25:5,p26:2,p27:2,p28:2,p29:1,p30:2},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:2,p8:1,p9:5,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:2,p26:5,p27:1,p28:2,p29:1,p30:8},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:2,p8:4,p9:4,p10:2,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:3,p27:1,p28:1,p29:1,p30:6},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:5,p11:3,p12:1,p13:2,p14:2,p15:0,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:4,p26:4,p27:2,p28:3,p29:5,p30:6},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:2,p5:3,p6:2,p7:3,p8:2,p9:5,p10:3,p11:1,p12:1,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:0,p21:0,p22:1,p23:1,p24:4,p25:1,p26:1,p27:1,p28:1,p29:5,p30:15},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:3,p11:1,p12:1,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:3,p25:2,p26:4,p27:1,p28:4,p29:3,p30:6},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:4,p8:4,p9:2,p10:2,p11:2,p12:2,p13:1,p14:2,p15:1,p16:1,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:2,p25:4,p26:4,p27:1,p28:1,p29:4,p30:2},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:3,p11:2,p12:2,p13:3,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:2,p26:3,p27:1,p28:1,p29:1,p30:8},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:19,p4:2,p5:3,p6:1,p7:3,p8:2,p9:3,p10:3,p11:2,p12:2,p13:1,p14:2,p15:1,p16:1,p17:1,p18:0,p19:0,p20:1,p21:0,p22:1,p23:0,p24:3,p25:3,p26:3,p27:4,p28:3,p29:3,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:4,p8:3,p9:1,p10:3,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:3,p27:1,p28:2,p29:1,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:1,p8:2,p9:4,p10:5,p11:1,p12:5,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:0,p21:0,p22:1,p23:0,p24:3,p25:4,p26:4,p27:2,p28:4,p29:4,p30:10},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:2,p7:4,p8:1,p9:3,p10:5,p11:1,p12:1,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:5,p26:4,p27:2,p28:4,p29:5,p30:22},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:2,p7:3,p8:2,p9:1,p10:3,p11:1,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:4,p27:3,p28:4,p29:3,p30:18},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:2,p12:1,p13:2,p14:4,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:5,p25:2,p26:2,p27:1,p28:1,p29:3,p30:2},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:1,p12:1,p13:2,p14:2,p15:0,p16:1,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:4,p27:1,p28:1,p29:4,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:5,p25:4,p26:5,p27:1,p28:2,p29:5,p30:12},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:2,p8:1,p9:5,p10:5,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:1,p27:1,p28:1,p29:5,p30:10},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:2,p12:2,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:2,p29:4,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:2,p8:2,p9:4,p10:4,p11:5,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:2,p29:2,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:1,p8:1,p9:3,p10:1,p11:2,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:1,p29:3,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:2,p8:1,p9:3,p10:3,p11:2,p12:1,p13:1,p14:3,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:4,p27:1,p28:3,p29:2,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:2,p7:4,p8:4,p9:1,p10:1,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:3,p27:1,p28:1,p29:2,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:4,p8:2,p9:1,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:2,p27:1,p28:4,p29:5,p30:2},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:4,p8:3,p9:2,p10:3,p11:2,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:2,p27:1,p28:2,p29:3,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:2,p5:3,p6:1,p7:3,p8:1,p9:3,p10:5,p11:2,p12:1,p13:2,p14:4,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:3,p25:1,p26:2,p27:1,p28:1,p29:3,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:18,p4:2,p5:3,p6:1,p7:3,p8:2,p9:3,p10:5,p11:2,p12:1,p13:2,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:2,p27:1,p28:1,p29:4,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:3,p8:3,p9:2,p10:5,p11:1,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:3,p27:1,p28:3,p29:5,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:19,p4:1,p5:3,p6:1,p7:4,p8:4,p9:2,p10:5,p11:2,p12:5,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:2,p25:3,p26:4,p27:2,p28:3,p29:2,p30:2},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:4,p8:3,p9:5,p10:5,p11:1,p12:5,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:4,p26:5,p27:1,p28:2,p29:2,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:4,p8:3,p9:5,p10:5,p11:2,p12:2,p13:1,p14:4,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:1,p29:3,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:1,p11:1,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:1,p25:4,p26:2,p27:2,p28:2,p29:1,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:2,p7:4,p8:4,p9:2,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:1,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:2,p26:4,p27:1,p28:1,p29:4,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:4,p8:4,p9:5,p10:1,p11:1,p12:2,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:1,p26:1,p27:2,p28:2,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:2,p5:3,p6:1,p7:4,p8:4,p9:3,p10:3,p11:2,p12:1,p13:2,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:4,p27:1,p28:1,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:4,p8:2,p9:5,p10:5,p11:2,p12:1,p13:2,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:1,p29:3,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:3,p8:2,p9:2,p10:2,p11:2,p12:2,p13:1,p14:4,p15:0,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:5,p25:2,p26:2,p27:1,p28:2,p29:5,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:19,p4:2,p5:3,p6:1,p7:2,p8:1,p9:4,p10:3,p11:3,p12:1,p13:2,p14:3,p15:1,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:1,p27:1,p28:1,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:20,p4:1,p5:3,p6:2,p7:3,p8:2,p9:3,p10:5,p11:3,p12:5,p13:1,p14:1,p15:2,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:5,p25:5,p26:3,p27:1,p28:1,p29:5,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:19,p4:2,p5:3,p6:1,p7:3,p8:3,p9:5,p10:3,p11:2,p12:2,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:0,p23:1,p24:4,p25:5,p26:3,p27:1,p28:2,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:1,p8:4,p9:5,p10:1,p11:1,p12:1,p13:1,p14:2,p15:0,p16:1,p17:1,p18:0,p19:0,p20:0,p21:1,p22:0,p23:1,p24:3,p25:4,p26:4,p27:1,p28:2,p29:5,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:2,p8:1,p9:3,p10:5,p11:3,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:3,p27:1,p28:2,p29:1,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:2,p8:3,p9:5,p10:5,p11:3,p12:2,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:2,p26:1,p27:1,p28:1,p29:3,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:2,p5:3,p6:1,p7:4,p8:4,p9:1,p10:1,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:4,p27:1,p28:1,p29:5,p30:2},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:4,p8:3,p9:5,p10:5,p11:3,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:4,p27:1,p28:1,p29:5,p30:2},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:4,p8:3,p9:2,p10:3,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:3,p25:2,p26:4,p27:1,p28:4,p29:1,p30:8},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:2,p5:3,p6:1,p7:3,p8:4,p9:4,p10:3,p11:3,p12:2,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:4,p25:3,p26:4,p27:2,p28:5,p29:5,p30:2},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:3,p8:3,p9:4,p10:5,p11:3,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:1,p26:4,p27:1,p28:1,p29:3,p30:8},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:19,p4:1,p5:3,p6:1,p7:4,p8:2,p9:2,p10:5,p11:3,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:5,p25:4,p26:4,p27:1,p28:1,p29:1,p30:9},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:4,p27:3,p28:3,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:3,p8:4,p9:5,p10:5,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:5,p25:4,p26:4,p27:1,p28:1,p29:1,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:4,p8:4,p9:2,p10:2,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:4,p27:1,p28:2,p29:5,p30:2},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:2,p7:4,p8:3,p9:3,p10:3,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:5,p25:2,p26:2,p27:1,p28:2,p29:5,p30:14},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:2,p7:3,p8:3,p9:3,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:3,p27:1,p28:1,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:2,p8:1,p9:5,p10:5,p11:1,p12:2,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:3,p27:2,p28:2,p29:2,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:4,p8:4,p9:5,p10:5,p11:2,p12:2,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:5,p27:3,p28:4,p29:5,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:19,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:3,p12:5,p13:3,p14:3,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:0,p22:0,p23:1,p24:1,p25:5,p26:5,p27:4,p28:3,p29:5,p30:12},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:19,p4:1,p5:3,p6:2,p7:1,p8:1,p9:5,p10:5,p11:3,p12:5,p13:3,p14:2,p15:2,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:1,p24:5,p25:3,p26:4,p27:1,p28:1,p29:4,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:5,p27:2,p28:4,p29:5,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:1,p24:4,p25:2,p26:2,p27:1,p28:1,p29:3,p30:4},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:2,p5:3,p6:1,p7:2,p8:2,p9:3,p10:3,p11:3,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:3,p25:3,p26:2,p27:2,p28:2,p29:3,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:3,p8:1,p9:3,p10:3,p11:3,p12:2,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:3,p25:4,p26:3,p27:2,p28:3,p29:5,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:0,p8:2,p9:4,p10:4,p11:1,p12:2,p13:2,p14:3,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:3,p25:3,p26:3,p27:2,p28:3,p29:2,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:1,p12:1,p13:2,p14:3,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:5,p26:5,p27:1,p28:2,p29:2,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:4,p8:4,p9:5,p10:5,p11:3,p12:1,p13:1,p14:3,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:2,p28:2,p29:3,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:3,p8:3,p9:5,p10:3,p11:2,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:4,p25:3,p26:5,p27:3,p28:5,p29:5,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:2,p5:3,p6:1,p7:2,p8:2,p9:3,p10:5,p11:3,p12:1,p13:4,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:5,p27:5,p28:5,p29:4,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:3,p11:3,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:4,p27:1,p28:3,p29:4,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:1,p11:3,p12:1,p13:2,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:1,p24:4,p25:3,p26:3,p27:1,p28:2,p29:4,p30:4},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:3,p8:3,p9:4,p10:5,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:1,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:5,p27:2,p28:5,p29:5,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:3,p12:1,p13:1,p14:4,p15:0,p16:0,p17:1,p18:1,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:5,p26:5,p27:2,p28:4,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:19,p4:2,p5:3,p6:1,p7:3,p8:2,p9:4,p10:3,p11:1,p12:5,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:0,p23:1,p24:5,p25:3,p26:4,p27:2,p28:2,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:2,p8:2,p9:4,p10:5,p11:3,p12:1,p13:4,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:0,p23:1,p24:4,p25:2,p26:5,p27:1,p28:1,p29:2,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:2,p5:3,p6:1,p7:2,p8:4,p9:4,p10:5,p11:3,p12:2,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:4,p26:3,p27:1,p28:1,p29:5,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:2,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:5,p25:4,p26:2,p27:1,p28:2,p29:5,p30:6},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:3,p8:3,p9:3,p10:3,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:4,p27:1,p28:1,p29:4,p30:8},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:1,p12:5,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:1,p23:1,p24:4,p25:3,p26:3,p27:1,p28:1,p29:2,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:2,p5:3,p6:1,p7:2,p8:2,p9:4,p10:5,p11:3,p12:1,p13:2,p14:4,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:4,p25:4,p26:4,p27:1,p28:1,p29:4,p30:6},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:3,p8:4,p9:3,p10:5,p11:3,p12:1,p13:1,p14:3,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:5,p27:1,p28:3,p29:5,p30:8},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:3,p8:2,p9:5,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:2,p27:2,p28:3,p29:2,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:3,p8:3,p9:3,p10:3,p11:1,p12:1,p13:1,p14:4,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:3,p27:1,p28:1,p29:1,p30:4},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:2,p5:3,p6:2,p7:3,p8:2,p9:5,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:2,p28:3,p29:2,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:3,p11:1,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:2,p28:2,p29:2,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:3,p8:4,p9:3,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:3,p27:1,p28:3,p29:5,p30:6},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:2,p7:2,p8:2,p9:4,p10:4,p11:1,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:3,p25:3,p26:1,p27:1,p28:2,p29:4,p30:18},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:2,p8:3,p9:4,p10:5,p11:3,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:2,p29:3,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:3,p8:2,p9:5,p10:3,p11:5,p12:1,p13:1,p14:3,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:5,p25:4,p26:3,p27:2,p28:3,p29:1,p30:4},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:18,p4:2,p5:3,p6:1,p7:4,p8:3,p9:1,p10:3,p11:3,p12:1,p13:1,p14:3,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:5,p25:3,p26:2,p27:1,p28:2,p29:4,p30:4},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:4,p8:3,p9:1,p10:5,p11:3,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:5,p25:4,p26:5,p27:2,p28:3,p29:5,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:4,p8:3,p9:2,p10:5,p11:2,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:4,p26:3,p27:1,p28:3,p29:4,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:2,p8:1,p9:3,p10:5,p11:3,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:4,p27:2,p28:2,p29:1,p30:10},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:2,p8:1,p9:3,p10:5,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:5,p27:2,p28:4,p29:4,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:19,p4:1,p5:3,p6:2,p7:2,p8:3,p9:4,p10:5,p11:1,p12:5,p13:2,p14:1,p15:1,p16:0,p17:0,p18:0,p19:0,p20:1,p21:0,p22:1,p23:0,p24:2,p25:2,p26:3,p27:3,p28:4,p29:5,p30:16},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:3,p8:1,p9:5,p10:4,p11:1,p12:1,p13:1,p14:1,p15:1,p16:0,p17:1,p18:1,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:1,p26:2,p27:1,p28:1,p29:3,p30:6},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:21,p4:1,p5:3,p6:1,p7:4,p8:4,p9:5,p10:5,p11:2,p12:5,p13:1,p14:3,p15:2,p16:0,p17:0,p18:1,p19:1,p20:1,p21:1,p22:1,p23:0,p24:3,p25:3,p26:2,p27:1,p28:1,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:3,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:0,p21:0,p22:1,p23:0,p24:4,p25:4,p26:4,p27:1,p28:3,p29:3,p30:11},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:2,p7:3,p8:4,p9:5,p10:5,p11:2,p12:5,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:5,p27:1,p28:4,p29:2,p30:9},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:3,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:4,p27:1,p28:3,p29:4,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:2,p7:4,p8:4,p9:2,p10:5,p11:2,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:2,p27:1,p28:2,p29:4,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:4,p8:2,p9:1,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:2,p27:1,p28:1,p29:3,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:21,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:3,p12:5,p13:2,p14:2,p15:2,p16:0,p17:1,p18:0,p19:1,p20:1,p21:0,p22:1,p23:1,p24:5,p25:3,p26:3,p27:5,p28:2,p29:4,p30:21},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:20,p4:2,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:2,p12:5,p13:2,p14:3,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:3,p25:2,p26:2,p27:1,p28:3,p29:3,p30:8},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:19,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:5,p11:1,p12:5,p13:1,p14:1,p15:1,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:3,p25:2,p26:5,p27:4,p28:4,p29:5,p30:5},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:2,p7:3,p8:2,p9:5,p10:5,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:4,p27:1,p28:2,p29:5,p30:10},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:3,p8:2,p9:4,p10:5,p11:2,p12:2,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:4,p27:1,p28:2,p29:2,p30:5},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:2,p3:18,p4:2,p5:3,p6:1,p7:2,p8:3,p9:5,p10:3,p11:2,p12:2,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:3,p25:1,p26:3,p27:4,p28:5,p29:4,p30:13},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:2,p3:19,p4:1,p5:3,p6:1,p7:2,p8:1,p9:5,p10:5,p11:2,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:4,p27:1,p28:4,p29:4,p30:10},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:2,p7:2,p8:2,p9:3,p10:5,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:1,p26:4,p27:1,p28:3,p29:4,p30:10},output:{g1:1,g2:0,g3:0}},
{input:{p1:1,p2:1,p3:20,p4:1,p5:3,p6:1,p7:1,p8:0,p9:5,p10:5,p11:2,p12:1,p13:2,p14:1,p15:1,p16:1,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:5,p25:3,p26:1,p27:1,p28:1,p29:5,p30:5},output:{g1:0,g2:1,g3:0}},
{input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:3,p8:2,p9:3,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:1,p24:3,p25:1,p26:2,p27:1,p28:2,p29:1,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:1,p5:3,p6:1,p7:1,p8:3,p9:4,p10:5,p11:5,p12:2,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:0,p22:1,p23:1,p24:4,p25:3,p26:3,p27:1,p28:3,p29:5,p30:11},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:3,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:4,p27:1,p28:1,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:15,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:3,p11:5,p12:1,p13:1,p14:1,p15:1,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:1,p24:4,p25:1,p26:3,p27:1,p28:1,p29:2,p30:6},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:15,p4:2,p5:3,p6:1,p7:3,p8:3,p9:4,p10:5,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:4,p27:2,p28:3,p29:5,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:2,p8:3,p9:4,p10:3,p11:3,p12:1,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:5,p26:2,p27:1,p28:2,p29:5,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:2,p2:1,p3:15,p4:2,p5:3,p6:1,p7:2,p8:1,p9:4,p10:5,p11:1,p12:1,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:0,p22:0,p23:0,p24:1,p25:3,p26:4,p27:1,p28:1,p29:1,p30:0},output:{g1:0,g2:0,g3:1}},
{input:{p1:2,p2:2,p3:16,p4:2,p5:3,p6:2,p7:4,p8:4,p9:4,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:5,p25:3,p26:2,p27:1,p28:3,p29:2,p30:5},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:16,p4:1,p5:3,p6:2,p7:1,p8:2,p9:5,p10:5,p11:5,p12:1,p13:1,p14:3,p15:0,p16:1,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:3,p27:1,p28:1,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:1,p7:3,p8:2,p9:4,p10:5,p11:3,p12:2,p13:1,p14:2,p15:1,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:1,p24:4,p25:5,p26:4,p27:1,p28:2,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:5,p12:2,p13:1,p14:1,p15:1,p16:0,p17:1,p18:0,p19:0,p20:0,p21:0,p22:1,p23:0,p24:5,p25:4,p26:4,p27:2,p28:2,p29:5,p30:0},output:{g1:0,g2:0,g3:1}},
{input:{p1:2,p2:1,p3:15,p4:2,p5:3,p6:1,p7:4,p8:4,p9:1,p10:5,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:1,p25:5,p26:1,p27:3,p28:5,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:1,p5:3,p6:2,p7:2,p8:2,p9:4,p10:5,p11:2,p12:1,p13:2,p14:4,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:0,p22:0,p23:1,p24:1,p25:2,p26:1,p27:1,p28:1,p29:1,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:15,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:3,p11:2,p12:2,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:3,p27:1,p28:2,p29:4,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:15,p4:2,p5:3,p6:1,p7:1,p8:1,p9:5,p10:3,p11:3,p12:1,p13:2,p14:1,p15:1,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:4,p26:3,p27:1,p28:2,p29:2,p30:4},output:{g1:0,g2:0,g3:1}},
{input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:0,p8:2,p9:5,p10:5,p11:5,p12:1,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:3,p25:2,p26:3,p27:1,p28:2,p29:2,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:1,p7:2,p8:3,p9:5,p10:5,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:5,p26:5,p27:1,p28:3,p29:3,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:15,p4:2,p5:3,p6:1,p7:3,p8:3,p9:5,p10:3,p11:3,p12:2,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:4,p25:1,p26:3,p27:1,p28:1,p29:4,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:2,p2:2,p3:16,p4:1,p5:3,p6:1,p7:1,p8:1,p9:4,p10:3,p11:1,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:1,p24:5,p25:4,p26:5,p27:4,p28:5,p29:3,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:17,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:1,p19:0,p20:0,p21:1,p22:1,p23:0,p24:4,p25:4,p26:3,p27:2,p28:4,p29:5,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:15,p4:2,p5:3,p6:1,p7:4,p8:1,p9:2,p10:3,p11:2,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:4,p27:1,p28:2,p29:2,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:15,p4:2,p5:3,p6:1,p7:4,p8:1,p9:2,p10:3,p11:2,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:4,p27:1,p28:2,p29:2,p30:7},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:16,p4:2,p5:3,p6:1,p7:3,p8:4,p9:5,p10:2,p11:5,p12:1,p13:3,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:0,p21:1,p22:0,p23:0,p24:3,p25:4,p26:5,p27:1,p28:2,p29:5,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:15,p4:2,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:3,p12:1,p13:4,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:1,p24:5,p25:4,p26:5,p27:2,p28:4,p29:4,p30:8},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:15,p4:1,p5:3,p6:1,p7:3,p8:3,p9:4,p10:4,p11:2,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:3,p27:1,p28:1,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:17,p4:2,p5:3,p6:1,p7:2,p8:1,p9:5,p10:5,p11:5,p12:1,p13:3,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:0,p22:0,p23:1,p24:5,p25:5,p26:5,p27:5,p28:5,p29:3,p30:8},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:4,p8:4,p9:1,p10:1,p11:3,p12:1,p13:2,p14:3,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:2,p26:2,p27:1,p28:1,p29:4,p30:6},output:{g1:1,g2:0,g3:0}},
{input:{p1:2,p2:1,p3:15,p4:2,p5:3,p6:1,p7:1,p8:2,p9:5,p10:3,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:5,p25:1,p26:2,p27:1,p28:1,p29:1,p30:3},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:2,p8:3,p9:5,p10:3,p11:3,p12:1,p13:3,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:5,p26:4,p27:1,p28:2,p29:1,p30:2},output:{g1:1,g2:0,g3:0}},
{input:{p1:2,p2:2,p3:16,p4:2,p5:3,p6:1,p7:1,p8:2,p9:5,p10:5,p11:3,p12:2,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:3,p27:1,p28:1,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:3,p12:1,p13:3,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:5,p27:1,p28:1,p29:4,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:1,p5:3,p6:1,p7:1,p8:2,p9:5,p10:3,p11:3,p12:1,p13:1,p14:3,p15:1,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:1,p25:3,p26:2,p27:1,p28:2,p29:4,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:1,p5:3,p6:1,p7:1,p8:2,p9:5,p10:3,p11:3,p12:1,p13:1,p14:3,p15:1,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:1,p25:3,p26:2,p27:1,p28:2,p29:4,p30:3},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:15,p4:1,p5:3,p6:1,p7:2,p8:1,p9:4,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:1,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:4,p25:4,p26:2,p27:3,p28:3,p29:2,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:1,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:3,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:0,p23:1,p24:5,p25:4,p26:3,p27:2,p28:1,p29:2,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:17,p4:2,p5:3,p6:1,p7:1,p8:2,p9:4,p10:3,p11:2,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:5,p26:5,p27:5,p28:5,p29:3,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:1,p12:2,p13:4,p14:4,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:4,p25:3,p26:2,p27:1,p28:1,p29:1,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:5,p12:2,p13:4,p14:3,p15:0,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:4,p26:3,p27:1,p28:1,p29:5,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:15,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:1,p12:2,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:1,p29:2,p30:1},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:5,p12:1,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:2,p26:2,p27:4,p28:3,p29:2,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:15,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:4,p11:3,p12:2,p13:3,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:2,p26:1,p27:1,p28:2,p29:2,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:15,p4:2,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:5,p12:2,p13:1,p14:3,p15:0,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:4,p26:3,p27:2,p28:2,p29:5,p30:2},output:{g1:1,g2:0,g3:0}},
{input:{p1:2,p2:2,p3:16,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:5,p12:2,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:3,p25:4,p26:4,p27:3,p28:4,p29:5,p30:6},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:18,p4:1,p5:3,p6:1,p7:1,p8:2,p9:5,p10:5,p11:3,p12:2,p13:1,p14:2,p15:1,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:3,p25:4,p26:4,p27:2,p28:3,p29:5,p30:9},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:15,p4:1,p5:3,p6:1,p7:3,p8:1,p9:5,p10:3,p11:1,p12:1,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:3,p25:2,p26:3,p27:1,p28:3,p29:4,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:2,p8:2,p9:5,p10:3,p11:3,p12:2,p13:3,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:4,p27:1,p28:1,p29:2,p30:1},output:{g1:1,g2:0,g3:0}},
{input:{p1:2,p2:2,p3:15,p4:1,p5:3,p6:1,p7:2,p8:2,p9:2,p10:5,p11:2,p12:1,p13:3,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:3,p27:1,p28:2,p29:4,p30:1},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:5,p10:1,p11:3,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:1,p24:4,p25:3,p26:1,p27:1,p28:1,p29:3,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:15,p4:2,p5:3,p6:1,p7:3,p8:3,p9:3,p10:5,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:5,p26:4,p27:1,p28:1,p29:1,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:2,p8:2,p9:4,p10:5,p11:3,p12:1,p13:2,p14:2,p15:1,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:0,p23:0,p24:4,p25:4,p26:4,p27:2,p28:3,p29:5,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:1,p12:2,p13:3,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:1,p24:4,p25:3,p26:2,p27:1,p28:1,p29:4,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:2,p2:2,p3:16,p4:1,p5:3,p6:1,p7:2,p8:1,p9:4,p10:3,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:2,p25:4,p26:3,p27:2,p28:3,p29:4,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:15,p4:2,p5:3,p6:1,p7:1,p8:3,p9:4,p10:5,p11:2,p12:2,p13:3,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:4,p27:3,p28:5,p29:3,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:15,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:3,p11:3,p12:1,p13:2,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:5,p25:3,p26:2,p27:1,p28:1,p29:4,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:2,p8:1,p9:5,p10:5,p11:1,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:5,p25:4,p26:3,p27:1,p28:1,p29:5,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:15,p4:1,p5:3,p6:1,p7:3,p8:3,p9:3,p10:3,p11:3,p12:2,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:2,p28:4,p29:3,p30:11},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:3,p12:2,p13:2,p14:2,p15:3,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:3,p25:4,p26:3,p27:1,p28:1,p29:1,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:17,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:4,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:0,p22:0,p23:0,p24:4,p25:5,p26:3,p27:1,p28:1,p29:5,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:19,p4:1,p5:3,p6:1,p7:2,p8:3,p9:4,p10:3,p11:3,p12:5,p13:1,p14:1,p15:1,p16:0,p17:0,p18:0,p19:0,p20:1,p21:0,p22:1,p23:1,p24:4,p25:4,p26:4,p27:1,p28:1,p29:2,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:1,p7:2,p8:1,p9:4,p10:5,p11:3,p12:1,p13:3,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:0,p22:0,p23:1,p24:5,p25:5,p26:3,p27:1,p28:1,p29:3,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:15,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:0,p22:0,p23:1,p24:5,p25:2,p26:1,p27:1,p28:3,p29:4,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:3,p12:2,p13:3,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:0,p22:1,p23:0,p24:3,p25:4,p26:5,p27:1,p28:2,p29:1,p30:1},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:1,p5:3,p6:2,p7:2,p8:2,p9:5,p10:5,p11:1,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:0,p22:0,p23:0,p24:4,p25:3,p26:4,p27:1,p28:2,p29:1,p30:6},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:1,p7:2,p8:2,p9:4,p10:5,p11:3,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:5,p27:1,p28:2,p29:4,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:3,p11:3,p12:2,p13:1,p14:1,p15:1,p16:0,p17:1,p18:1,p19:1,p20:0,p21:1,p22:1,p23:0,p24:4,p25:4,p26:3,p27:1,p28:4,p29:3,p30:1},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:18,p4:2,p5:3,p6:2,p7:3,p8:2,p9:5,p10:5,p11:3,p12:5,p13:2,p14:3,p15:2,p16:0,p17:1,p18:0,p19:0,p20:0,p21:0,p22:0,p23:1,p24:3,p25:3,p26:2,p27:1,p28:1,p29:2,p30:6},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:19,p4:1,p5:3,p6:1,p7:1,p8:1,p9:4,p10:3,p11:3,p12:1,p13:1,p14:3,p15:1,p16:0,p17:0,p18:0,p19:1,p20:1,p21:0,p22:0,p23:1,p24:5,p25:3,p26:1,p27:1,p28:1,p29:3,p30:6},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:18,p4:2,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:1,p12:1,p13:2,p14:1,p15:1,p16:0,p17:0,p18:0,p19:1,p20:1,p21:0,p22:1,p23:0,p24:4,p25:4,p26:3,p27:3,p28:4,p29:4,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:18,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:4,p11:3,p12:1,p13:2,p14:1,p15:1,p16:0,p17:0,p18:0,p19:0,p20:0,p21:0,p22:1,p23:1,p24:3,p25:2,p26:3,p27:1,p28:1,p29:2,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:19,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:3,p12:5,p13:2,p14:2,p15:1,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:1,p25:1,p26:4,p27:4,p28:1,p29:1,p30:12},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:2,p7:2,p8:2,p9:2,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:0,p21:1,p22:0,p23:1,p24:3,p25:3,p26:2,p27:1,p28:1,p29:3,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:17,p4:1,p5:3,p6:1,p7:0,p8:1,p9:5,p10:4,p11:3,p12:2,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:0,p23:0,p24:2,p25:4,p26:4,p27:3,p28:5,p29:5,p30:5},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:1,p8:2,p9:4,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:0,p22:1,p23:0,p24:4,p25:4,p26:5,p27:1,p28:3,p29:3,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:1,p5:3,p6:1,p7:3,p8:3,p9:5,p10:5,p11:2,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:0,p22:1,p23:1,p24:4,p25:5,p26:4,p27:1,p28:1,p29:4,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:1,p8:1,p9:3,p10:3,p11:1,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:4,p26:4,p27:2,p28:2,p29:4,p30:2},output:{g1:1,g2:0,g3:0}},
{input:{p1:2,p2:2,p3:17,p4:1,p5:3,p6:1,p7:3,p8:3,p9:3,p10:4,p11:3,p12:1,p13:2,p14:4,p15:1,p16:0,p17:1,p18:1,p19:1,p20:1,p21:1,p22:0,p23:0,p24:5,p25:4,p26:5,p27:3,p28:4,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:1,p9:5,p10:3,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:3,p27:1,p28:1,p29:1,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:5,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:1,p19:1,p20:1,p21:1,p22:0,p23:1,p24:4,p25:2,p26:5,p27:1,p28:2,p29:5,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:2,p2:2,p3:17,p4:1,p5:3,p6:1,p7:1,p8:2,p9:5,p10:5,p11:3,p12:2,p13:1,p14:1,p15:1,p16:0,p17:1,p18:0,p19:1,p20:1,p21:0,p22:1,p23:1,p24:5,p25:3,p26:5,p27:5,p28:5,p29:1,p30:12},output:{g1:0,g2:0,g3:1}},
{input:{p1:2,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:3,p9:5,p10:5,p11:3,p12:2,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:5,p27:1,p28:5,p29:5,p30:8},output:{g1:1,g2:0,g3:0}},
{input:{p1:2,p2:2,p3:17,p4:2,p5:3,p6:1,p7:2,p8:2,p9:3,p10:3,p11:5,p12:1,p13:3,p14:4,p15:1,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:1,p25:3,p26:5,p27:3,p28:5,p29:3,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:3,p12:5,p13:1,p14:4,p15:0,p16:1,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:2,p25:2,p26:1,p27:1,p28:1,p29:5,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:2,p2:1,p3:19,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:1,p12:1,p13:1,p14:3,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:5,p25:4,p26:5,p27:1,p28:1,p29:1,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:2,p12:1,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:1,p24:4,p25:4,p26:5,p27:1,p28:2,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:20,p4:1,p5:3,p6:1,p7:3,p8:3,p9:4,p10:3,p11:5,p12:1,p13:2,p14:2,p15:1,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:3,p25:3,p26:4,p27:2,p28:4,p29:3,p30:8},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:17,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:3,p11:3,p12:2,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:1,p24:4,p25:3,p26:3,p27:1,p28:1,p29:3,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:17,p4:2,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:3,p12:1,p13:3,p14:1,p15:1,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:4,p25:4,p26:5,p27:1,p28:2,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:3,p12:2,p13:3,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:5,p25:3,p26:2,p27:1,p28:1,p29:1,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:5,p25:3,p26:2,p27:1,p28:1,p29:1,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:2,p2:1,p3:17,p4:1,p5:3,p6:2,p7:1,p8:0,p9:5,p10:5,p11:5,p12:1,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:4,p26:5,p27:1,p28:1,p29:4,p30:1},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:18,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:5,p12:1,p13:1,p14:2,p15:1,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:2,p27:1,p28:1,p29:5,p30:9},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:1,p5:3,p6:1,p7:3,p8:1,p9:5,p10:5,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:3,p25:1,p26:3,p27:1,p28:3,p29:1,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:1,p5:3,p6:1,p7:3,p8:2,p9:3,p10:4,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:3,p25:1,p26:3,p27:1,p28:4,p29:3,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:18,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:4,p11:2,p12:1,p13:2,p14:2,p15:0,p16:1,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:2,p25:3,p26:5,p27:1,p28:4,p29:3,p30:8},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:4,p8:4,p9:2,p10:1,p11:2,p12:2,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:1,p23:1,p24:4,p25:3,p26:3,p27:2,p28:3,p29:2,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:1,p8:2,p9:5,p10:5,p11:2,p12:1,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:5,p27:1,p28:4,p29:2,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:2,p2:1,p3:18,p4:1,p5:3,p6:2,p7:2,p8:4,p9:5,p10:3,p11:2,p12:2,p13:1,p14:2,p15:1,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:2,p25:3,p26:2,p27:1,p28:3,p29:1,p30:8},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:16,p4:2,p5:3,p6:1,p7:2,p8:1,p9:5,p10:3,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:2,p26:1,p27:1,p28:1,p29:2,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:1,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:5,p12:1,p13:3,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:2,p27:1,p28:3,p29:5,p30:6},output:{g1:0,g2:0,g3:1}},
{input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:2,p8:3,p9:4,p10:3,p11:5,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:3,p25:3,p26:3,p27:1,p28:1,p29:2,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:2,p10:2,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:4,p27:1,p28:2,p29:3,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:18,p4:1,p5:3,p6:1,p7:4,p8:4,p9:4,p10:2,p11:1,p12:1,p13:1,p14:4,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:0,p22:1,p23:1,p24:5,p25:5,p26:5,p27:5,p28:5,p29:5,p30:2},output:{g1:0,g2:0,g3:1}},
{input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:3,p8:4,p9:4,p10:5,p11:5,p12:1,p13:3,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:0,p23:0,p24:4,p25:2,p26:1,p27:1,p28:1,p29:2,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:17,p4:1,p5:3,p6:1,p7:4,p8:4,p9:5,p10:3,p11:1,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:3,p27:1,p28:2,p29:5,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:1,p7:4,p8:1,p9:5,p10:5,p11:5,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:2,p26:3,p27:1,p28:2,p29:5,p30:1},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:3,p11:5,p12:1,p13:4,p14:3,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:5,p25:1,p26:3,p27:2,p28:2,p29:3,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:1,p7:2,p8:2,p9:4,p10:5,p11:5,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:1,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:1,p26:3,p27:1,p28:2,p29:5,p30:5},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:3,p11:5,p12:2,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:5,p25:1,p26:3,p27:1,p28:2,p29:5,p30:1},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:17,p4:1,p5:3,p6:1,p7:3,p8:3,p9:3,p10:3,p11:1,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:1,p26:4,p27:5,p28:5,p29:3,p30:8},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:17,p4:1,p5:3,p6:1,p7:1,p8:1,p9:4,p10:3,p11:5,p12:1,p13:3,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:5,p25:1,p26:3,p27:3,p28:3,p29:1,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:16,p4:1,p5:3,p6:1,p7:2,p8:1,p9:2,p10:3,p11:5,p12:1,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:0,p21:1,p22:1,p23:1,p24:4,p25:2,p26:2,p27:1,p28:4,p29:5,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:1,p9:5,p10:3,p11:5,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:3,p25:2,p26:2,p27:1,p28:1,p29:3,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:2,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:2,p11:5,p12:2,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:1,p26:2,p27:2,p28:5,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:15,p4:2,p5:3,p6:1,p7:1,p8:2,p9:5,p10:3,p11:3,p12:1,p13:3,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:5,p25:5,p26:5,p27:1,p28:3,p29:5,p30:11},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:15,p4:1,p5:3,p6:2,p7:2,p8:2,p9:5,p10:5,p11:2,p12:1,p13:3,p14:4,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:5,p25:4,p26:5,p27:2,p28:3,p29:5,p30:8},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:15,p4:1,p5:3,p6:2,p7:2,p8:1,p9:3,p10:3,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:2,p29:5,p30:11},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:3,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:0,p23:1,p24:4,p25:3,p26:3,p27:2,p28:2,p29:5,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:1,p9:5,p10:5,p11:1,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:1,p25:2,p26:4,p27:2,p28:2,p29:1,p30:8},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:17,p4:1,p5:3,p6:1,p7:3,p8:2,p9:4,p10:5,p11:1,p12:1,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:1,p24:4,p25:3,p26:3,p27:2,p28:2,p29:1,p30:5},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:5,p12:1,p13:2,p14:2,p15:0,p16:1,p17:0,p18:1,p19:0,p20:1,p21:1,p22:0,p23:0,p24:5,p25:1,p26:3,p27:1,p28:1,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:3,p11:3,p12:1,p13:2,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:5,p25:3,p26:5,p27:1,p28:4,p29:5,p30:1},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:17,p4:2,p5:3,p6:1,p7:4,p8:4,p9:2,p10:5,p11:3,p12:2,p13:3,p14:1,p15:3,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:3,p25:3,p26:3,p27:1,p28:3,p29:5,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:17,p4:2,p5:3,p6:1,p7:1,p8:3,p9:5,p10:5,p11:3,p12:2,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:0,p23:1,p24:5,p25:1,p26:2,p27:3,p28:3,p29:5,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:17,p4:1,p5:3,p6:1,p7:3,p8:4,p9:3,p10:5,p11:5,p12:1,p13:1,p14:2,p15:1,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:1,p24:5,p25:4,p26:4,p27:3,p28:4,p29:5,p30:8},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:17,p4:1,p5:3,p6:1,p7:4,p8:4,p9:2,p10:2,p11:3,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:2,p26:5,p27:1,p28:1,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:16,p4:2,p5:3,p6:1,p7:4,p8:1,p9:5,p10:4,p11:5,p12:2,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:1,p26:2,p27:2,p28:1,p29:2,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:17,p4:1,p5:3,p6:2,p7:1,p8:1,p9:4,p10:4,p11:5,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:5,p26:5,p27:1,p28:2,p29:3,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:1,p7:4,p8:2,p9:5,p10:5,p11:3,p12:1,p13:2,p14:2,p15:0,p16:1,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:2,p28:3,p29:5,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:2,p2:2,p3:16,p4:1,p5:3,p6:2,p7:2,p8:2,p9:5,p10:3,p11:3,p12:2,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:1,p24:4,p25:1,p26:2,p27:2,p28:2,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:17,p4:1,p5:3,p6:1,p7:3,p8:2,p9:5,p10:5,p11:5,p12:2,p13:2,p14:2,p15:0,p16:0,p17:1,p18:1,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:1,p26:2,p27:2,p28:2,p29:1,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:19,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:5,p12:1,p13:1,p14:2,p15:2,p16:0,p17:1,p18:0,p19:1,p20:1,p21:0,p22:1,p23:0,p24:4,p25:4,p26:3,p27:3,p28:4,p29:4,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:17,p4:1,p5:3,p6:2,p7:1,p8:0,p9:5,p10:5,p11:1,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:1,p24:4,p25:1,p26:2,p27:1,p28:1,p29:5,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:4,p11:3,p12:2,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:0,p22:1,p23:1,p24:3,p25:5,p26:5,p27:2,p28:2,p29:4,p30:3},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:1,p8:2,p9:5,p10:5,p11:1,p12:2,p13:1,p14:3,p15:0,p16:1,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:1,p24:4,p25:3,p26:4,p27:1,p28:1,p29:3,p30:5},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:16,p4:2,p5:3,p6:1,p7:1,p8:2,p9:5,p10:4,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:4,p26:4,p27:2,p28:4,p29:5,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:1,p7:3,p8:1,p9:5,p10:5,p11:3,p12:1,p13:2,p14:2,p15:3,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:1,p24:5,p25:4,p26:4,p27:1,p28:1,p29:5,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:17,p4:2,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:0,p22:0,p23:1,p24:5,p25:5,p26:5,p27:3,p28:5,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:18,p4:2,p5:3,p6:1,p7:1,p8:0,p9:4,p10:4,p11:3,p12:5,p13:3,p14:1,p15:1,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:2,p27:1,p28:1,p29:4,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:17,p4:2,p5:3,p6:1,p7:1,p8:1,p9:5,p10:3,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:1,p24:4,p25:5,p26:5,p27:1,p28:3,p29:2,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:18,p4:1,p5:3,p6:1,p7:1,p8:1,p9:4,p10:4,p11:3,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:3,p27:1,p28:4,p29:5,p30:6},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:2,p8:2,p9:5,p10:3,p11:3,p12:2,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:0,p23:1,p24:5,p25:4,p26:3,p27:1,p28:1,p29:1,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:17,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:3,p12:1,p13:1,p14:1,p15:1,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:0,p23:1,p24:1,p25:2,p26:1,p27:2,p28:3,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:16,p4:2,p5:3,p6:1,p7:3,p8:2,p9:3,p10:5,p11:3,p12:2,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:5,p26:5,p27:2,p28:3,p29:5,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:16,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:5,p26:5,p27:2,p28:4,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:18,p4:2,p5:3,p6:1,p7:1,p8:1,p9:3,p10:5,p11:3,p12:5,p13:2,p14:1,p15:1,p16:0,p17:1,p18:0,p19:0,p20:1,p21:0,p22:1,p23:1,p24:5,p25:3,p26:3,p27:2,p28:3,p29:5,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:18,p4:2,p5:3,p6:1,p7:3,p8:2,p9:3,p10:5,p11:3,p12:1,p13:1,p14:1,p15:1,p16:0,p17:0,p18:0,p19:0,p20:1,p21:0,p22:1,p23:0,p24:2,p25:3,p26:1,p27:2,p28:2,p29:5,p30:0},output:{g1:0,g2:0,g3:1}},
{input:{p1:2,p2:2,p3:19,p4:1,p5:3,p6:1,p7:3,p8:2,p9:4,p10:3,p11:3,p12:1,p13:2,p14:1,p15:3,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:3,p25:2,p26:1,p27:1,p28:1,p29:3,p30:4},output:{g1:0,g2:0,g3:1}},
{input:{p1:2,p2:2,p3:18,p4:1,p5:3,p6:1,p7:3,p8:3,p9:4,p10:4,p11:3,p12:1,p13:1,p14:2,p15:2,p16:0,p17:1,p18:0,p19:1,p20:1,p21:0,p22:1,p23:0,p24:4,p25:4,p26:5,p27:1,p28:3,p29:3,p30:9},output:{g1:0,g2:0,g3:1}},
{input:{p1:2,p2:2,p3:16,p4:2,p5:3,p6:1,p7:2,p8:2,p9:3,p10:3,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:5,p25:4,p26:3,p27:2,p28:4,p29:4,p30:6},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:19,p4:1,p5:3,p6:1,p7:2,p8:1,p9:4,p10:5,p11:3,p12:5,p13:2,p14:1,p15:3,p16:0,p17:0,p18:0,p19:1,p20:0,p21:0,p22:1,p23:1,p24:4,p25:4,p26:3,p27:1,p28:3,p29:5,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:16,p4:1,p5:3,p6:2,p7:3,p8:2,p9:3,p10:4,p11:3,p12:1,p13:2,p14:2,p15:2,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:1,p24:2,p25:5,p26:5,p27:1,p28:1,p29:1,p30:8},output:{g1:0,g2:0,g3:1}},
{input:{p1:2,p2:1,p3:17,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:4,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:2,p27:1,p28:2,p29:5,p30:9},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:20,p4:2,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:3,p12:5,p13:2,p14:1,p15:1,p16:0,p17:1,p18:0,p19:0,p20:1,p21:0,p22:1,p23:1,p24:4,p25:4,p26:3,p27:2,p28:4,p29:4,p30:12},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:18,p4:2,p5:3,p6:2,p7:4,p8:3,p9:3,p10:3,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:4,p27:3,p28:4,p29:2,p30:8},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:18,p4:2,p5:3,p6:1,p7:3,p8:2,p9:5,p10:5,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:2,p25:5,p26:5,p27:5,p28:5,p29:5,p30:8},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:19,p4:2,p5:3,p6:1,p7:1,p8:1,p9:5,p10:3,p11:1,p12:5,p13:3,p14:2,p15:1,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:4,p27:3,p28:3,p29:2,p30:8},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:17,p4:1,p5:3,p6:1,p7:3,p8:3,p9:2,p10:5,p11:3,p12:1,p13:2,p14:2,p15:1,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:5,p26:4,p27:2,p28:3,p29:3,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:18,p4:1,p5:3,p6:1,p7:1,p8:3,p9:4,p10:3,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:0,p22:1,p23:1,p24:4,p25:3,p26:3,p27:2,p28:3,p29:3,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:19,p4:2,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:1,p12:5,p13:3,p14:1,p15:1,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:4,p27:3,p28:3,p29:5,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:18,p4:1,p5:3,p6:2,p7:1,p8:2,p9:4,p10:5,p11:3,p12:1,p13:2,p14:2,p15:2,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:3,p27:1,p28:1,p29:5,p30:2},output:{g1:0,g2:0,g3:1}},
{input:{p1:2,p2:1,p3:19,p4:1,p5:3,p6:2,p7:1,p8:1,p9:4,p10:5,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:0,p22:0,p23:0,p24:1,p25:4,p26:4,p27:1,p28:1,p29:5,p30:0},output:{g1:0,g2:0,g3:1}},
{input:{p1:2,p2:1,p3:18,p4:2,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:5,p12:1,p13:2,p14:1,p15:1,p16:0,p17:0,p18:0,p19:0,p20:1,p21:0,p22:1,p23:1,p24:5,p25:5,p26:5,p27:1,p28:1,p29:3,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:1,p7:0,p8:0,p9:4,p10:5,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:3,p27:1,p28:1,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:2,p7:3,p8:1,p9:5,p10:4,p11:3,p12:5,p13:2,p14:3,p15:0,p16:0,p17:1,p18:1,p19:0,p20:1,p21:0,p22:0,p23:0,p24:4,p25:2,p26:3,p27:2,p28:2,p29:3,p30:5},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:17,p4:1,p5:3,p6:1,p7:4,p8:2,p9:1,p10:3,p11:1,p12:1,p13:1,p14:2,p15:0,p16:1,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:5,p26:5,p27:1,p28:3,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:18,p4:2,p5:3,p6:1,p7:2,p8:2,p9:3,p10:3,p11:3,p12:1,p13:1,p14:2,p15:1,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:2,p25:3,p26:3,p27:1,p28:2,p29:4,p30:3},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:17,p4:1,p5:3,p6:1,p7:4,p8:1,p9:2,p10:4,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:1,p24:3,p25:2,p26:2,p27:1,p28:1,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:17,p4:1,p5:3,p6:1,p7:1,p8:2,p9:4,p10:5,p11:3,p12:2,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:5,p26:1,p27:1,p28:1,p29:3,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:18,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:3,p12:1,p13:3,p14:2,p15:2,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:0,p23:1,p24:3,p25:4,p26:4,p27:2,p28:2,p29:5,p30:3},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:18,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:4,p11:2,p12:2,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:4,p25:3,p26:5,p27:1,p28:1,p29:1,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:17,p4:1,p5:3,p6:1,p7:3,p8:3,p9:3,p10:3,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:3,p27:1,p28:1,p29:4,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:18,p4:1,p5:3,p6:2,p7:1,p8:2,p9:4,p10:5,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:3,p27:1,p28:2,p29:4,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:18,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:1,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:4,p25:3,p26:5,p27:1,p28:2,p29:1,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:2,p2:2,p3:18,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:5,p11:2,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:5,p27:1,p28:1,p29:5,p30:3},output:{g1:1,g2:0,g3:0}},
{input:{p1:2,p2:1,p3:17,p4:1,p5:3,p6:1,p7:4,p8:2,p9:5,p10:5,p11:3,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:2,p29:4,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:2,p2:1,p3:18,p4:2,p5:3,p6:1,p7:2,p8:2,p9:4,p10:5,p11:3,p12:1,p13:3,p14:2,p15:1,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:0,p23:1,p24:4,p25:3,p26:3,p27:1,p28:1,p29:4,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:18,p4:1,p5:3,p6:1,p7:1,p8:2,p9:4,p10:3,p11:1,p12:1,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:0,p23:0,p24:4,p25:1,p26:4,p27:5,p28:5,p29:1,p30:8},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:18,p4:2,p5:3,p6:1,p7:4,p8:4,p9:4,p10:3,p11:5,p12:1,p13:3,p14:1,p15:0,p16:0,p17:1,p18:1,p19:1,p20:1,p21:1,p22:1,p23:1,p24:2,p25:5,p26:5,p27:1,p28:1,p29:1,p30:5},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:17,p4:2,p5:3,p6:1,p7:1,p8:1,p9:5,p10:3,p11:5,p12:2,p13:3,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:0,p21:0,p22:0,p23:0,p24:4,p25:2,p26:3,p27:3,p28:4,p29:4,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:18,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:3,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:1,p24:1,p25:3,p26:1,p27:1,p28:1,p29:2,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:18,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:3,p11:3,p12:2,p13:2,p14:3,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:5,p25:4,p26:5,p27:1,p28:4,p29:3,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:18,p4:2,p5:3,p6:2,p7:4,p8:2,p9:1,p10:5,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:5,p25:3,p26:1,p27:1,p28:1,p29:5,p30:0},output:{g1:0,g2:0,g3:1}},
{input:{p1:2,p2:1,p3:18,p4:1,p5:3,p6:1,p7:1,p8:1,p9:4,p10:3,p11:3,p12:1,p13:3,p14:2,p15:1,p16:0,p17:0,p18:0,p19:0,p20:1,p21:0,p22:0,p23:0,p24:4,p25:4,p26:2,p27:1,p28:2,p29:2,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:19,p4:1,p5:3,p6:1,p7:1,p8:1,p9:4,p10:3,p11:5,p12:2,p13:2,p14:1,p15:1,p16:0,p17:0,p18:0,p19:0,p20:1,p21:0,p22:0,p23:0,p24:5,p25:5,p26:5,p27:2,p28:3,p29:2,p30:0},output:{g1:0,g2:0,g3:1}},
{input:{p1:2,p2:1,p3:17,p4:1,p5:3,p6:1,p7:4,p8:2,p9:1,p10:5,p11:3,p12:2,p13:2,p14:4,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:2,p26:3,p27:3,p28:1,p29:5,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:2,p7:2,p8:1,p9:3,p10:5,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:5,p25:3,p26:3,p27:1,p28:2,p29:2,p30:5},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:18,p4:1,p5:3,p6:2,p7:1,p8:1,p9:4,p10:3,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:1,p24:5,p25:2,p26:3,p27:1,p28:2,p29:3,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:18,p4:1,p5:3,p6:1,p7:1,p8:2,p9:4,p10:4,p11:3,p12:2,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:0,p22:0,p23:0,p24:4,p25:1,p26:1,p27:1,p28:1,p29:4,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:19,p4:2,p5:3,p6:2,p7:1,p8:1,p9:4,p10:4,p11:3,p12:5,p13:2,p14:2,p15:3,p16:0,p17:1,p18:0,p19:1,p20:1,p21:0,p22:0,p23:1,p24:3,p25:5,p26:4,p27:1,p28:4,p29:1,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:18,p4:2,p5:3,p6:1,p7:2,p8:2,p9:3,p10:5,p11:1,p12:1,p13:2,p14:3,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:2,p26:1,p27:1,p28:1,p29:4,p30:5},output:{g1:1,g2:0,g3:0}},
{input:{p1:2,p2:2,p3:17,p4:2,p5:3,p6:1,p7:4,p8:3,p9:3,p10:5,p11:1,p12:1,p13:2,p14:2,p15:1,p16:0,p17:1,p18:1,p19:1,p20:0,p21:1,p22:1,p23:1,p24:4,p25:5,p26:5,p27:1,p28:3,p29:2,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:18,p4:1,p5:3,p6:1,p7:3,p8:3,p9:3,p10:3,p11:3,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:1,p24:5,p25:3,p26:4,p27:1,p28:1,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:1,p7:4,p8:4,p9:1,p10:3,p11:5,p12:2,p13:2,p14:2,p15:0,p16:0,p17:1,p18:1,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:2,p29:5,p30:2},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:17,p4:1,p5:3,p6:2,p7:3,p8:2,p9:3,p10:5,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:1,p24:1,p25:2,p26:3,p27:1,p28:2,p29:5,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:2,p2:2,p3:18,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:3,p11:1,p12:2,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:0,p21:1,p22:1,p23:1,p24:3,p25:3,p26:2,p27:1,p28:2,p29:3,p30:2},output:{g1:1,g2:0,g3:0}},
{input:{p1:2,p2:1,p3:18,p4:1,p5:3,p6:1,p7:1,p8:1,p9:4,p10:3,p11:3,p12:2,p13:2,p14:3,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:2,p27:1,p28:1,p29:4,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:2,p2:1,p3:18,p4:2,p5:3,p6:2,p7:1,p8:2,p9:4,p10:5,p11:3,p12:1,p13:3,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:1,p24:4,p25:3,p26:4,p27:1,p28:4,p29:5,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:2,p2:1,p3:18,p4:1,p5:3,p6:1,p7:3,p8:3,p9:3,p10:3,p11:5,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:2,p27:1,p28:3,p29:3,p30:6},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:17,p4:1,p5:3,p6:1,p7:4,p8:4,p9:4,p10:4,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:2,p25:3,p26:4,p27:1,p28:1,p29:1,p30:4},output:{g1:1,g2:0,g3:0}},
{input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:1,p7:1,p8:2,p9:5,p10:3,p11:3,p12:2,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:0,p21:1,p22:0,p23:0,p24:3,p25:2,p26:2,p27:1,p28:2,p29:3,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:18,p4:2,p5:3,p6:1,p7:1,p8:3,p9:4,p10:5,p11:3,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:1,p19:0,p20:1,p21:1,p22:0,p23:0,p24:3,p25:3,p26:4,p27:2,p28:4,p29:3,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:18,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:3,p11:5,p12:1,p13:2,p14:3,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:2,p26:2,p27:2,p28:2,p29:5,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:1,p7:1,p8:1,p9:5,p10:3,p11:2,p12:1,p13:3,p14:1,p15:1,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:5,p25:2,p26:1,p27:1,p28:2,p29:1,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:18,p4:1,p5:3,p6:1,p7:2,p8:3,p9:4,p10:3,p11:3,p12:2,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:5,p25:2,p26:3,p27:1,p28:2,p29:4,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:18,p4:2,p5:3,p6:1,p7:4,p8:4,p9:5,p10:1,p11:5,p12:2,p13:3,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:1,p24:3,p25:2,p26:2,p27:4,p28:2,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:18,p4:2,p5:3,p6:1,p7:1,p8:2,p9:4,p10:3,p11:5,p12:2,p13:3,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:0,p22:1,p23:1,p24:4,p25:3,p26:3,p27:2,p28:3,p29:3,p30:3},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:17,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:4,p11:1,p12:1,p13:1,p14:3,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:0,p23:1,p24:3,p25:4,p26:3,p27:1,p28:1,p29:3,p30:8},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:1,p7:1,p8:2,p9:5,p10:5,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:3,p25:5,p26:5,p27:1,p28:3,p29:1,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:18,p4:2,p5:3,p6:1,p7:4,p8:4,p9:5,p10:5,p11:2,p12:1,p13:2,p14:3,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:4,p27:1,p28:1,p29:1,p30:0},output:{g1:1,g2:0,g3:0}},
{input:{p1:2,p2:1,p3:18,p4:2,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:1,p12:1,p13:4,p14:3,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:2,p27:1,p28:2,p29:4,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:19,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:3,p12:5,p13:2,p14:2,p15:1,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:3,p27:1,p28:1,p29:3,p30:4},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:18,p4:2,p5:3,p6:1,p7:4,p8:4,p9:1,p10:3,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:3,p27:3,p28:4,p29:2,p30:1},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:1,p3:18,p4:1,p5:3,p6:1,p7:3,p8:3,p9:5,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:1,p26:3,p27:1,p28:2,p29:1,p30:1},output:{g1:1,g2:0,g3:0}},
{input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:1,p7:3,p8:1,p9:4,p10:5,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:4,p25:5,p26:4,p27:2,p28:3,p29:1,p30:10},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:18,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:1,p11:1,p12:2,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:3,p25:2,p26:4,p27:1,p28:4,p29:2,p30:4},output:{g1:1,g2:0,g3:0}},
{input:{p1:2,p2:2,p3:18,p4:2,p5:3,p6:1,p7:2,p8:1,p9:5,p10:5,p11:5,p12:1,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:1,p23:1,p24:4,p25:4,p26:3,p27:1,p28:3,p29:5,p30:0},output:{g1:0,g2:1,g3:0}},
{input:{p1:2,p2:2,p3:17,p4:1,p5:3,p6:1,p7:2,p8:3,p9:5,p10:3,p11:1,p12:2,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:3,p27:1,p28:1,p29:3,p30:4},output:{g1:1,g2:0,g3:0}}

  ]
    ;
}
function get_training_data(){
  var training_data=
  [
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:2,p7:4,p8:4,p9:4,p10:1,p11:3,p12:1,p13:2,p14:2,p15:0,p16:1,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:4,p27:1,p28:1,p29:3,p30:4},output:{g1:0,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:3,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:5,p25:3,p26:3,p27:1,p28:1,p29:3,p30:2},output:{g1:0.45,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:5,p12:1,p13:1,p14:2,p15:0,p16:1,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:2,p27:2,p28:3,p29:3,p30:6},output:{g1:0.6,g2:0.65,g3:0.6}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:4,p8:2,p9:2,p10:3,p11:1,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:3,p25:2,p26:2,p27:1,p28:1,p29:5,p30:0},output:{g1:0.7,g2:0.7,g3:0.7}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:3,p8:3,p9:5,p10:5,p11:1,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:2,p27:1,p28:2,p29:5,p30:0},output:{g1:0.55,g2:0.65,g3:0.65}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:3,p9:3,p10:5,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:2,p27:1,p28:2,p29:5,p30:6},output:{g1:0.6,g2:0.6,g3:0.65}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:4,p27:1,p28:1,p29:3,p30:0},output:{g1:0.65,g2:0.6,g3:0.65}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:2,p7:4,p8:4,p9:5,p10:1,p11:1,p12:1,p13:2,p14:2,p15:0,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:1,p26:4,p27:1,p28:1,p29:1,p30:2},output:{g1:0.5,g2:0.65,g3:0.65}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:2,p7:3,p8:2,p9:3,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:2,p27:1,p28:1,p29:1,p30:0},output:{g1:0.75,g2:0.8,g3:0.85}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:3,p8:4,p9:5,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:5,p26:1,p27:1,p28:1,p29:5,p30:0},output:{g1:0.6,g2:0.6,g3:0.65}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:2,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:3,p25:3,p26:3,p27:1,p28:2,p29:2,p30:2},output:{g1:0.7,g2:0.7,g3:0.7}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:2,p8:1,p9:3,p10:5,p11:2,p12:2,p13:3,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:2,p26:2,p27:1,p28:1,p29:4,p30:0},output:{g1:0.5,g2:0.6,g3:0.65}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:2,p10:3,p11:3,p12:2,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:3,p29:5,p30:0},output:{g1:0.6,g2:0.65,g3:0.6}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:3,p9:1,p10:5,p11:3,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:3,p27:1,p28:2,p29:3,p30:0},output:{g1:0.6,g2:0.6,g3:0.65}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:2,p7:2,p8:2,p9:5,p10:5,p11:1,p12:5,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:5,p26:2,p27:1,p28:1,p29:3,p30:0},output:{g1:0.7,g2:0.7,g3:0.75}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:2,p10:5,p11:1,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:4,p27:1,p28:2,p29:2,p30:6},output:{g1:0.85,g2:0.85,g3:0.85}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:3,p11:2,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:3,p25:2,p26:3,p27:1,p28:2,p29:2,p30:10},output:{g1:0.65,g2:0.65,g3:0.7}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:3,p8:3,p9:5,p10:5,p11:2,p12:1,p13:3,p14:2,p15:0,p16:1,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:5,p25:3,p26:2,p27:1,p28:1,p29:4,p30:2},output:{g1:0.65,g2:0.7,g3:0.7}},
    {input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:3,p8:2,p9:3,p10:3,p11:3,p12:1,p13:1,p14:1,p15:3,p16:0,p17:1,p18:1,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:5,p26:5,p27:2,p28:4,p29:5,p30:2},output:{g1:0.4,g2:0.4,g3:0.35}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:3,p9:2,p10:5,p11:1,p12:2,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:3,p25:1,p26:3,p27:1,p28:3,p29:5,p30:6},output:{g1:0.6,g2:0.6,g3:0.6}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:3,p9:1,p10:5,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:1,p27:1,p28:1,p29:1,p30:0},output:{g1:0.6,g2:0.65,g3:0.7}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:2,p10:2,p11:5,p12:2,p13:1,p14:1,p15:0,p16:0,p17:1,p18:1,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:2,p27:1,p28:1,p29:5,p30:0},output:{g1:0.55,g2:0.6,g3:0.6}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:2,p9:1,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:5,p26:1,p27:1,p28:3,p29:5,p30:0},output:{g1:0.6,g2:0.65,g3:0.7}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:4,p27:2,p28:4,p29:5,p30:2},output:{g1:0.5,g2:0.5,g3:0.5}},
    {input:{p1:1,p2:1,p3:15,p4:2,p5:3,p6:1,p7:2,p8:4,p9:3,p10:2,p11:3,p12:1,p13:1,p14:3,p15:0,p16:1,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:2,p27:1,p28:1,p29:5,p30:2},output:{g1:0.5,g2:0.55,g3:0.5}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:3,p11:1,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:1,p25:2,p26:2,p27:1,p28:3,p29:5,p30:6},output:{g1:0.5,g2:0.55,g3:0.6}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:1,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:2,p27:1,p28:2,p29:5,p30:8},output:{g1:0.55,g2:0.6,g3:0.6}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:2,p9:2,p10:3,p11:5,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:2,p25:2,p26:4,p27:2,p28:4,p29:1,p30:0},output:{g1:0.55,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:2,p7:3,p8:4,p9:3,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:1,p17:1,p18:1,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:3,p27:1,p28:1,p29:5,p30:2},output:{g1:0.6,g2:0.6,g3:0.65}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:1,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:1,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:4,p26:5,p27:5,p28:5,p29:5,p30:4},output:{g1:0.6,g2:0.55,g3:0.6}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:2,p10:3,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:1,p19:0,p20:0,p21:1,p22:1,p23:0,p24:5,p25:4,p26:2,p27:3,p28:4,p29:5,p30:0},output:{g1:0.5,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:3,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:1,p27:1,p28:1,p29:5,p30:2},output:{g1:0.75,g2:0.75,g3:0.75}},
    {input:{p1:1,p2:2,p3:15,p4:2,p5:3,p6:1,p7:4,p8:3,p9:1,p10:4,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:5,p26:2,p27:1,p28:1,p29:5,p30:0},output:{g1:0.65,g2:0.7,g3:0.75}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:3,p8:3,p9:5,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:5,p25:3,p26:2,p27:1,p28:1,p29:2,p30:0},output:{g1:0.65,g2:0.6,g3:0.6}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:3,p8:2,p9:5,p10:5,p11:1,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:5,p25:4,p26:3,p27:1,p28:1,p29:5,p30:4},output:{g1:0.6,g2:0.6,g3:0.6}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:2,p8:3,p9:5,p10:5,p11:5,p12:2,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:3,p25:5,p26:1,p27:1,p28:1,p29:5,p30:4},output:{g1:0.55,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:3,p9:1,p10:3,p11:1,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:3,p27:1,p28:1,p29:4,p30:0},output:{g1:0.7,g2:0.7,g3:0.7}},
    {input:{p1:1,p2:2,p3:16,p4:2,p5:3,p6:2,p7:4,p8:4,p9:5,p10:1,p11:2,p12:1,p13:2,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:2,p25:4,p26:3,p27:1,p28:1,p29:5,p30:4},output:{g1:0.65,g2:0.65,g3:0.65}},
    {input:{p1:1,p2:1,p3:15,p4:2,p5:3,p6:1,p7:3,p8:4,p9:3,p10:2,p11:3,p12:1,p13:1,p14:3,p15:0,p16:1,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:2,p27:1,p28:1,p29:5,p30:2},output:{g1:0.55,g2:0.6,g3:0.6}},
    {input:{p1:1,p2:1,p3:15,p4:2,p5:3,p6:1,p7:2,p8:2,p9:4,p10:5,p11:2,p12:1,p13:1,p14:1,p15:0,p16:1,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:1,p27:1,p28:1,p29:2,p30:8},output:{g1:0.7,g2:0.65,g3:0.6}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:1,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:1,p24:3,p25:3,p26:3,p27:1,p28:2,p29:3,p30:16},output:{g1:0.55,g2:0.55,g3:0.5}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:5,p11:1,p12:5,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:1,p24:5,p25:4,p26:3,p27:2,p28:4,p29:5,p30:8},output:{g1:0.5,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:1,p11:3,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:1,p29:5,p30:0},output:{g1:0.7,g2:0.75,g3:0.75}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:3,p11:3,p12:2,p13:1,p14:1,p15:0,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:1,p27:1,p28:1,p29:1,p30:0},output:{g1:0.45,g2:0.5,g3:0.5}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:4,p11:3,p12:2,p13:2,p14:2,p15:1,p16:1,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:2,p28:2,p29:5,p30:14},output:{g1:0.5,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:2,p7:4,p8:3,p9:5,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:1,p17:1,p18:1,p19:1,p20:1,p21:1,p22:1,p23:1,p24:5,p25:2,p26:2,p27:1,p28:1,p29:5,p30:4},output:{g1:0.5,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:2,p7:3,p8:3,p9:5,p10:3,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:2,p25:3,p26:5,p27:1,p28:4,p29:3,p30:6},output:{g1:0.65,g2:0.6,g3:0.65}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:3,p9:2,p10:3,p11:2,p12:1,p13:1,p14:4,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:2,p27:1,p28:1,p29:2,p30:2},output:{g1:0.85,g2:0.85,g3:0.85}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:2,p9:1,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:3,p27:2,p28:2,p29:5,p30:4},output:{g1:0.55,g2:0.6,g3:0.65}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:1,p11:5,p12:2,p13:1,p14:2,p15:0,p16:1,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:4,p25:4,p26:4,p27:1,p28:1,p29:3,p30:2},output:{g1:0.65,g2:0.6,g3:0.6}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:3,p11:3,p12:1,p13:3,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:2,p28:3,p29:4,p30:0},output:{g1:0.7,g2:0.65,g3:0.65}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:4,p8:2,p9:2,p10:5,p11:5,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:1,p29:5,p30:0},output:{g1:0.8,g2:0.7,g3:0.8}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:2,p7:4,p8:2,p9:2,p10:2,p11:5,p12:2,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:5,p25:5,p26:5,p27:3,p28:4,p29:5,p30:4},output:{g1:0.5,g2:0.45,g3:0.45}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:3,p11:3,p12:1,p13:1,p14:1,p15:0,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:3,p25:3,p26:4,p27:2,p28:3,p29:5,p30:0},output:{g1:0.65,g2:0.6,g3:0.6}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:2,p7:3,p8:3,p9:5,p10:5,p11:5,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:4,p27:4,p28:4,p29:1,p30:0},output:{g1:0.65,g2:0.6,g3:0.65}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:2,p7:2,p8:1,p9:5,p10:5,p11:5,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:5,p25:3,p26:4,p27:1,p28:1,p29:2,p30:2},output:{g1:0.6,g2:0.65,g3:0.6}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:2,p7:4,p8:3,p9:3,p10:3,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:2,p27:1,p28:1,p29:1,p30:0},output:{g1:0.75,g2:0.7,g3:0.75}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:2,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:3,p25:2,p26:2,p27:1,p28:1,p29:5,p30:8},output:{g1:0.75,g2:0.75,g3:0.8}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:1,p8:2,p9:5,p10:4,p11:1,p12:2,p13:1,p14:2,p15:0,p16:1,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:2,p27:1,p28:1,p29:5,p30:0},output:{g1:0.7,g2:0.65,g3:0.7}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:2,p9:3,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:1,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:3,p27:1,p28:1,p29:5,p30:2},output:{g1:0.8,g2:0.75,g3:0.8}},
    {input:{p1:1,p2:1,p3:16,p4:2,p5:3,p6:1,p7:4,p8:4,p9:2,p10:1,p11:5,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:2,p25:4,p26:4,p27:2,p28:3,p29:4,p30:0},output:{g1:0.85,g2:0.8,g3:0.8}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:1,p8:1,p9:3,p10:3,p11:3,p12:2,p13:4,p14:1,p15:0,p16:1,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:1,p24:5,p25:5,p26:5,p27:5,p28:5,p29:5,p30:0},output:{g1:0.5,g2:0.5,g3:0.8}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:1,p8:2,p9:5,p10:3,p11:2,p12:2,p13:1,p14:2,p15:0,p16:1,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:3,p27:1,p28:1,p29:1,p30:0},output:{g1:0.65,g2:0.65,g3:0.5}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:3,p9:1,p10:2,p11:1,p12:1,p13:1,p14:3,p15:0,p16:1,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:3,p25:4,p26:4,p27:2,p28:4,p29:4,p30:0},output:{g1:0.7,g2:0.65,g3:0.65}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:4,p8:3,p9:3,p10:3,p11:2,p12:2,p13:1,p14:2,p15:0,p16:1,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:4,p26:4,p27:2,p28:4,p29:2,p30:0},output:{g1:0.65,g2:0.6,g3:0.6}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:3,p9:1,p10:3,p11:3,p12:1,p13:3,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:3,p27:1,p28:2,p29:1,p30:2},output:{g1:0.8,g2:0.75,g3:0.8}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:2,p7:4,p8:4,p9:5,p10:3,p11:2,p12:1,p13:1,p14:4,p15:0,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:1,p24:1,p25:3,p26:3,p27:5,p28:5,p29:3,p30:0},output:{g1:0.55,g2:0.6,g3:0.6}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:3,p8:1,p9:3,p10:5,p11:3,p12:1,p13:1,p14:4,p15:0,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:2,p29:5,p30:0},output:{g1:0.5,g2:0.45,g3:0.5}},
    {input:{p1:1,p2:1,p3:15,p4:2,p5:3,p6:1,p7:2,p8:2,p9:2,p10:3,p11:2,p12:1,p13:2,p14:2,p15:0,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:1,p26:3,p27:1,p28:3,p29:4,p30:0},output:{g1:0.55,g2:0.5,g3:0.55}},
    {input:{p1:1,p2:1,p3:15,p4:2,p5:3,p6:1,p7:3,p8:1,p9:5,p10:5,p11:2,p12:2,p13:2,p14:4,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:4,p25:4,p26:2,p27:2,p28:3,p29:3,p30:6},output:{g1:0.75,g2:0.75,g3:0.75}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:3,p8:1,p9:5,p10:5,p11:2,p12:2,p13:2,p14:4,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:2,p27:1,p28:1,p29:5,p30:2},output:{g1:0.65,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:2,p9:5,p10:5,p11:3,p12:1,p13:1,p14:4,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:3,p25:3,p26:3,p27:1,p28:1,p29:3,p30:0},output:{g1:0.55,g2:0.45,g3:0.5}},
    {input:{p1:1,p2:1,p3:15,p4:2,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:2,p12:1,p13:1,p14:2,p15:0,p16:1,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:1,p24:3,p25:3,p26:4,p27:2,p28:4,p29:5,p30:2},output:{g1:0.65,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:3,p8:1,p9:5,p10:5,p11:2,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:5,p25:3,p26:2,p27:2,p28:2,p29:5,p30:0},output:{g1:0.65,g2:0.65,g3:0.7}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:3,p8:3,p9:5,p10:3,p11:1,p12:1,p13:1,p14:2,p15:0,p16:1,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:2,p28:4,p29:5,p30:4},output:{g1:0.55,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:3,p9:1,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:2,p28:3,p29:5,p30:0},output:{g1:0.55,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:0,p9:1,p10:5,p11:3,p12:1,p13:2,p14:4,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:3,p25:4,p26:3,p27:1,p28:1,p29:1,p30:0},output:{g1:0.6,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:2,p12:1,p13:1,p14:4,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:5,p25:2,p26:3,p27:1,p28:3,p29:3,p30:1},output:{g1:0.65,g2:0.65,g3:0.65}},
    {input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:2,p8:1,p9:5,p10:5,p11:1,p12:1,p13:2,p14:1,p15:3,p16:1,p17:1,p18:0,p19:1,p20:1,p21:0,p22:1,p23:0,p24:4,p25:5,p26:1,p27:1,p28:1,p29:3,p30:0},output:{g1:0.45,g2:0.45,g3:0.5}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:3,p8:4,p9:4,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:2,p25:4,p26:3,p27:1,p28:2,p29:3,p30:14},output:{g1:0.6,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:2,p8:3,p9:5,p10:3,p11:3,p12:2,p13:1,p14:1,p15:0,p16:1,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:1,p24:3,p25:2,p26:2,p27:1,p28:3,p29:3,p30:0},output:{g1:0.55,g2:0.55,g3:0.6}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:2,p8:3,p9:5,p10:5,p11:1,p12:1,p13:1,p14:3,p15:0,p16:1,p17:0,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:5,p25:3,p26:2,p27:1,p28:2,p29:5,p30:2},output:{g1:0.5,g2:0.45,g3:0.45}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:3,p8:2,p9:3,p10:5,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:4,p27:1,p28:1,p29:5,p30:4},output:{g1:0.6,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:3,p11:1,p12:1,p13:2,p14:2,p15:0,p16:0,p17:0,p18:1,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:3,p27:1,p28:3,p29:4,p30:2},output:{g1:0.65,g2:0.6,g3:0.65}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:1,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:4,p25:3,p26:2,p27:2,p28:3,p29:4,p30:2},output:{g1:0.65,g2:0.6,g3:0.6}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:3,p11:2,p12:2,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:4,p26:4,p27:2,p28:3,p29:5,p30:4},output:{g1:0.6,g2:0.55,g3:0.6}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:4,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:4,p27:1,p28:2,p29:2,p30:6},output:{g1:0.65,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:4,p8:2,p9:5,p10:5,p11:2,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:3,p27:1,p28:3,p29:1,p30:4},output:{g1:0.75,g2:0.75,g3:0.75}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:5,p11:2,p12:2,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:4,p25:4,p26:2,p27:1,p28:1,p29:3,p30:6},output:{g1:0.6,g2:0.5,g3:0.55}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:2,p7:4,p8:4,p9:1,p10:2,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:1,p26:3,p27:3,p28:5,p29:5,p30:6},output:{g1:0.45,g2:0.45,g3:0.5}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:3,p8:3,p9:5,p10:5,p11:1,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:3,p27:1,p28:3,p29:4,p30:2},output:{g1:0.45,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:4,p8:3,p9:3,p10:5,p11:2,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:5,p26:5,p27:1,p28:3,p29:1,p30:6},output:{g1:0.7,g2:0.65,g3:0.65}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:3,p8:1,p9:5,p10:5,p11:1,p12:2,p13:1,p14:2,p15:0,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:3,p25:3,p26:3,p27:2,p28:3,p29:2,p30:0},output:{g1:0.6,g2:0.65,g3:0.6}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:2,p9:1,p10:3,p11:1,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:3,p27:1,p28:1,p29:1,p30:2},output:{g1:0.65,g2:0.7,g3:0.7}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:2,p11:2,p12:1,p13:1,p14:4,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:4,p27:1,p28:1,p29:4,p30:2},output:{g1:0.55,g2:0.6,g3:0.6}},
    {input:{p1:1,p2:1,p3:15,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:1,p12:1,p13:2,p14:4,p15:0,p16:1,p17:1,p18:1,p19:1,p20:1,p21:1,p22:1,p23:0,p24:3,p25:1,p26:2,p27:1,p28:1,p29:1,p30:4},output:{g1:0.65,g2:0.65,g3:0.65}},
    {input:{p1:1,p2:2,p3:16,p4:2,p5:3,p6:1,p7:4,p8:3,p9:3,p10:5,p11:2,p12:1,p13:2,p14:1,p15:0,p16:1,p17:1,p18:1,p19:1,p20:0,p21:1,p22:1,p23:0,p24:3,p25:3,p26:3,p27:1,p28:1,p29:4,p30:6},output:{g1:0.45,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:1,p9:5,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:1,p24:4,p25:3,p26:5,p27:1,p28:1,p29:5,p30:0},output:{g1:0.65,g2:0.6,g3:0.6}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:5,p10:5,p11:2,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:5,p25:3,p26:4,p27:1,p28:2,p29:1,p30:4},output:{g1:0.6,g2:0.65,g3:0.65}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:3,p9:5,p10:4,p11:3,p12:1,p13:1,p14:3,p15:0,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:5,p27:1,p28:1,p29:3,p30:2},output:{g1:0.6,g2:0.65,g3:0.65}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:3,p11:5,p12:1,p13:1,p14:1,p15:0,p16:1,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:5,p26:5,p27:5,p28:5,p29:4,p30:12},output:{g1:0.45,g2:0.45,g3:0.4}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:1,p11:5,p12:2,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:4,p26:3,p27:1,p28:1,p29:4,p30:0},output:{g1:0.8,g2:0.8,g3:0.8}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:5,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:1,p19:1,p20:0,p21:1,p22:1,p23:0,p24:5,p25:3,p26:3,p27:1,p28:1,p29:5,p30:2},output:{g1:0.6,g2:0.65,g3:0.6}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:3,p8:2,p9:3,p10:5,p11:1,p12:1,p13:2,p14:2,p15:0,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:5,p27:1,p28:1,p29:2,p30:16},output:{g1:0.55,g2:0.5,g3:0.5}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:2,p7:3,p8:4,p9:3,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:4,p27:1,p28:1,p29:1,p30:0},output:{g1:0.8,g2:0.8,g3:0.8}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:2,p7:3,p8:3,p9:5,p10:2,p11:2,p12:2,p13:1,p14:4,p15:0,p16:1,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:3,p27:1,p28:1,p29:4,p30:10},output:{g1:0.5,g2:0.5,g3:0.5}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:3,p12:1,p13:1,p14:4,p15:0,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:1,p26:2,p27:1,p28:1,p29:3,p30:4},output:{g1:0.5,g2:0.5,g3:0.5}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:3,p8:3,p9:3,p10:5,p11:1,p12:2,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:3,p27:1,p28:1,p29:5,p30:4},output:{g1:0.65,g2:0.7,g3:0.7}},
    {input:{p1:1,p2:2,p3:15,p4:2,p5:3,p6:1,p7:4,p8:4,p9:5,p10:5,p11:1,p12:2,p13:4,p14:4,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:1,p25:3,p26:5,p27:3,p28:5,p29:1,p30:8},output:{g1:0.6,g2:0.5,g3:0.55}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:2,p10:2,p11:5,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:5,p25:4,p26:5,p27:1,p28:1,p29:4,p30:2},output:{g1:0.75,g2:0.75,g3:0.7}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:2,p7:4,p8:4,p9:1,p10:1,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:5,p26:3,p27:1,p28:1,p29:4,p30:4},output:{g1:0.65,g2:0.7,g3:0.7}},
    {input:{p1:1,p2:1,p3:16,p4:2,p5:3,p6:1,p7:3,p8:3,p9:3,p10:5,p11:2,p12:2,p13:1,p14:3,p15:0,p16:1,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:1,p26:2,p27:1,p28:1,p29:2,p30:4},output:{g1:0.55,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:4,p10:5,p11:1,p12:1,p13:1,p14:2,p15:1,p16:1,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:3,p25:1,p26:2,p27:1,p28:1,p29:5,p30:12},output:{g1:0.4,g2:0.5,g3:0.5}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:2,p9:1,p10:5,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:3,p25:5,p26:2,p27:1,p28:1,p29:3,p30:10},output:{g1:0.9,g2:0.85,g3:0.9}},
    {input:{p1:1,p2:2,p3:15,p4:2,p5:3,p6:1,p7:2,p8:1,p9:2,p10:3,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:5,p25:4,p26:2,p27:1,p28:1,p29:5,p30:4},output:{g1:0.5,g2:0.45,g3:0.5}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:1,p11:3,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:4,p27:1,p28:2,p29:5,p30:6},output:{g1:0.8,g2:0.7,g3:0.7}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:5,p10:1,p11:2,p12:2,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:4,p25:4,p26:3,p27:1,p28:1,p29:2,p30:4},output:{g1:0.8,g2:0.75,g3:0.8}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:3,p8:3,p9:5,p10:3,p11:1,p12:2,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:2,p27:1,p28:1,p29:5,p30:6},output:{g1:0.7,g2:0.7,g3:0.75}},
    {input:{p1:1,p2:2,p3:17,p4:2,p5:3,p6:1,p7:1,p8:3,p9:5,p10:5,p11:3,p12:2,p13:3,p14:2,p15:1,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:2,p26:4,p27:1,p28:4,p29:5,p30:14},output:{g1:0.6,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:3,p8:4,p9:5,p10:5,p11:2,p12:2,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:3,p25:4,p26:3,p27:1,p28:2,p29:4,p30:2},output:{g1:0.7,g2:0.65,g3:0.7}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:1,p8:2,p9:4,p10:3,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:3,p25:2,p26:3,p27:1,p28:2,p29:1,p30:0},output:{g1:0.7,g2:0.7,g3:0.7}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:3,p11:1,p12:2,p13:1,p14:4,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:5,p26:4,p27:1,p28:2,p29:5,p30:6},output:{g1:0.7,g2:0.65,g3:0.65}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:4,p9:5,p10:2,p11:3,p12:2,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:2,p26:2,p27:1,p28:2,p29:5,p30:2},output:{g1:0.7,g2:0.6,g3:0.65}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:2,p10:5,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:3,p25:4,p26:4,p27:1,p28:4,p29:5,p30:4},output:{g1:0.6,g2:0.65,g3:0.65}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:5,p25:4,p26:4,p27:1,p28:1,p29:5,p30:0},output:{g1:0.6,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:3,p8:4,p9:3,p10:3,p11:1,p12:2,p13:1,p14:1,p15:0,p16:1,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:5,p26:5,p27:3,p28:2,p29:5,p30:2},output:{g1:0.45,g2:0.45,g3:0.45}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:2,p7:3,p8:4,p9:5,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:1,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:5,p25:3,p26:2,p27:1,p28:1,p29:1,p30:0},output:{g1:0.5,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:1,p3:19,p4:1,p5:3,p6:1,p7:0,p8:1,p9:4,p10:5,p11:3,p12:5,p13:1,p14:2,p15:2,p16:0,p17:1,p18:0,p19:0,p20:0,p21:0,p22:0,p23:0,p24:3,p25:4,p26:2,p27:1,p28:1,p29:5,p30:0},output:{g1:0.45,g2:0.5,g3:0.55}},
    {input:{p1:1,p2:2,p3:16,p4:2,p5:3,p6:1,p7:4,p8:4,p9:1,p10:1,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:3,p25:5,p26:5,p27:2,p28:5,p29:4,p30:8},output:{g1:0.7,g2:0.7,g3:0.75}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:2,p8:3,p9:5,p10:5,p11:3,p12:1,p13:2,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:1,p24:3,p25:2,p26:3,p27:2,p28:2,p29:1,p30:4},output:{g1:0.65,g2:0.6,g3:0.65}},
    {input:{p1:1,p2:1,p3:15,p4:2,p5:3,p6:1,p7:3,p8:4,p9:3,p10:1,p11:3,p12:2,p13:2,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:2,p26:2,p27:2,p28:2,p29:5,p30:0},output:{g1:0.5,g2:0.55,g3:0.6}},
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:2,p8:1,p9:3,p10:5,p11:2,p12:1,p13:1,p14:2,p15:3,p16:0,p17:1,p18:0,p19:1,p20:1,p21:0,p22:1,p23:1,p24:5,p25:4,p26:5,p27:1,p28:3,p29:5,p30:10},output:{g1:0.5,g2:0.45,g3:0.4}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:2,p7:2,p8:1,p9:5,p10:5,p11:3,p12:1,p13:3,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:3,p25:2,p26:2,p27:1,p28:2,p29:5,p30:8},output:{g1:0.55,g2:0.5,g3:0.55}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:3,p12:1,p13:3,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:1,p24:4,p25:3,p26:3,p27:1,p28:2,p29:4,p30:6},output:{g1:0.55,g2:0.6,g3:0.65}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:3,p12:2,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:3,p25:4,p26:4,p27:1,p28:3,p29:5,p30:2},output:{g1:0.65,g2:0.6,g3:0.6}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:2,p7:3,p8:4,p9:3,p10:5,p11:3,p12:2,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:3,p25:2,p26:1,p27:1,p28:4,p29:5,p30:12},output:{g1:0.75,g2:0.65,g3:0.7}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:2,p8:1,p9:4,p10:5,p11:3,p12:1,p13:4,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:3,p25:2,p26:1,p27:1,p28:1,p29:2,p30:4},output:{g1:0.45,g2:0.45,g3:0.55}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:2,p7:2,p8:2,p9:5,p10:5,p11:1,p12:1,p13:1,p14:1,p15:1,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:5,p25:3,p26:4,p27:1,p28:1,p29:5,p30:12},output:{g1:0.65,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:2,p3:15,p4:2,p5:3,p6:1,p7:3,p8:4,p9:4,p10:1,p11:3,p12:1,p13:4,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:1,p24:5,p25:3,p26:3,p27:1,p28:1,p29:5,p30:2},output:{g1:0.6,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:4,p11:3,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:3,p27:1,p28:1,p29:5,p30:4},output:{g1:0.65,g2:0.7,g3:0.75}},
    {input:{p1:1,p2:2,p3:17,p4:2,p5:3,p6:1,p7:3,p8:4,p9:4,p10:5,p11:3,p12:1,p13:3,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:5,p25:4,p26:5,p27:2,p28:4,p29:5,p30:2},output:{g1:0.5,g2:0.45,g3:0.5}},
    {input:{p1:1,p2:1,p3:16,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:3,p12:1,p13:4,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:5,p25:1,p26:3,p27:1,p28:1,p29:3,p30:0},output:{g1:0.7,g2:0.65,g3:0.65}},
    {input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:3,p8:1,p9:3,p10:3,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:3,p25:3,p26:4,p27:4,p28:5,p29:4,p30:2},output:{g1:0.55,g2:0.55,g3:0.6}},
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:2,p7:3,p8:2,p9:5,p10:3,p11:3,p12:5,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:1,p24:4,p25:3,p26:3,p27:5,p28:1,p29:5,p30:10},output:{g1:0.6,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:1,p3:16,p4:2,p5:3,p6:1,p7:1,p8:1,p9:5,p10:3,p11:2,p12:1,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:1,p24:3,p25:3,p26:3,p27:1,p28:2,p29:1,p30:8},output:{g1:0.6,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:2,p7:3,p8:3,p9:5,p10:5,p11:3,p12:5,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:1,p24:4,p25:3,p26:2,p27:1,p28:1,p29:5,p30:4},output:{g1:0.45,g2:0.45,g3:0.5}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:1,p8:1,p9:3,p10:5,p11:3,p12:1,p13:1,p14:2,p15:2,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:1,p24:4,p25:4,p26:4,p27:1,p28:3,p29:5,p30:0},output:{g1:0.5,g2:0.5,g3:0.5}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:1,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:2,p27:1,p28:1,p29:5,p30:6},output:{g1:0.65,g2:0.7,g3:0.7}},
    {input:{p1:1,p2:1,p3:15,p4:2,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:3,p12:1,p13:3,p14:1,p15:1,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:5,p25:5,p26:5,p27:1,p28:1,p29:1,p30:2},output:{g1:0.4,g2:0.45,g3:0.45}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:4,p8:3,p9:1,p10:3,p11:3,p12:2,p13:2,p14:4,p15:0,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:2,p25:2,p26:2,p27:1,p28:1,p29:3,p30:6},output:{g1:0.45,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:2,p7:3,p8:3,p9:3,p10:3,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:0,p21:1,p22:0,p23:1,p24:1,p25:3,p26:2,p27:2,p28:3,p29:1,p30:24},output:{g1:0.45,g2:0.4,g3:0.45}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:3,p11:3,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:3,p27:1,p28:3,p29:5,p30:0},output:{g1:0.75,g2:0.65,g3:0.65}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:3,p11:2,p12:2,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:2,p25:3,p26:3,p27:2,p28:2,p29:2,p30:4},output:{g1:0.6,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:3,p11:3,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:2,p27:1,p28:1,p29:5,p30:2},output:{g1:0.65,g2:0.65,g3:0.65}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:1,p8:1,p9:4,p10:4,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:3,p25:4,p26:4,p27:3,p28:3,p29:1,p30:4},output:{g1:0.5,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:2,p8:1,p9:5,p10:5,p11:1,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:5,p27:1,p28:2,p29:5,p30:22},output:{g1:0.45,g2:0.35,g3:0.3}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:3,p11:3,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:2,p27:1,p28:2,p29:5,p30:0},output:{g1:0.6,g2:0.6,g3:0.6}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:2,p7:2,p8:1,p9:4,p10:5,p11:1,p12:1,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:0,p22:1,p23:1,p24:4,p25:4,p26:2,p27:1,p28:1,p29:5,p30:0},output:{g1:0.55,g2:0.5,g3:0.5}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:3,p8:2,p9:2,p10:3,p11:1,p12:2,p13:1,p14:2,p15:1,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:3,p25:3,p26:2,p27:1,p28:1,p29:3,p30:2},output:{g1:0.55,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:1,p8:2,p9:4,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:4,p25:3,p26:2,p27:1,p28:1,p29:5,p30:6},output:{g1:0.65,g2:0.6,g3:0.65}},
    {input:{p1:1,p2:1,p3:15,p4:1,p5:3,p6:1,p7:1,p8:2,p9:4,p10:3,p11:3,p12:2,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:0,p21:1,p22:0,p23:1,p24:2,p25:3,p26:4,p27:2,p28:4,p29:1,p30:6},output:{g1:0.55,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:1,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:0,p22:1,p23:1,p24:3,p25:3,p26:2,p27:2,p28:1,p29:5,p30:16},output:{g1:0.45,g2:0.45,g3:0.4}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:2,p7:2,p8:1,p9:3,p10:5,p11:3,p12:1,p13:4,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:5,p26:5,p27:2,p28:5,p29:5,p30:0},output:{g1:0.6,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:3,p12:1,p13:1,p14:1,p15:2,p16:0,p17:0,p18:0,p19:0,p20:1,p21:0,p22:1,p23:1,p24:2,p25:3,p26:5,p27:2,p28:5,p29:4,p30:0},output:{g1:0.55,g2:0.45,g3:0}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:2,p8:1,p9:4,p10:5,p11:3,p12:1,p13:1,p14:1,p15:1,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:0,p23:1,p24:4,p25:4,p26:4,p27:3,p28:5,p29:5,p30:6},output:{g1:0.45,g2:0.5,g3:0.5}},
    {input:{p1:1,p2:1,p3:15,p4:2,p5:3,p6:1,p7:3,p8:3,p9:3,p10:3,p11:2,p12:5,p13:2,p14:3,p15:0,p16:0,p17:1,p18:1,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:2,p26:1,p27:2,p28:3,p29:3,p30:2},output:{g1:0.65,g2:0.65,g3:0.65}},
    {input:{p1:1,p2:2,p3:19,p4:1,p5:3,p6:1,p7:3,p8:2,p9:3,p10:4,p11:1,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:0,p22:1,p23:1,p24:4,p25:5,p26:4,p27:1,p28:1,p29:4,p30:6},output:{g1:0.55,g2:0.45,g3:0.55}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:4,p8:4,p9:5,p10:1,p11:3,p12:1,p13:1,p14:1,p15:0,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:1,p24:4,p25:2,p26:1,p27:1,p28:1,p29:4,p30:0},output:{g1:0.65,g2:0.65,g3:0.65}},
    {input:{p1:1,p2:2,p3:15,p4:2,p5:3,p6:1,p7:2,p8:3,p9:4,p10:3,p11:3,p12:1,p13:1,p14:2,p15:0,p16:1,p17:0,p18:1,p19:1,p20:1,p21:1,p22:0,p23:0,p24:4,p25:4,p26:4,p27:1,p28:1,p29:1,p30:0},output:{g1:0.35,g2:0.4,g3:0.4}},
    {input:{p1:1,p2:2,p3:17,p4:2,p5:3,p6:1,p7:1,p8:2,p9:5,p10:5,p11:2,p12:1,p13:1,p14:1,p15:3,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:2,p25:2,p26:2,p27:3,p28:3,p29:5,p30:14},output:{g1:0.45,g2:0.4,g3:0.5}},
    {input:{p1:1,p2:1,p3:18,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:3,p12:1,p13:3,p14:1,p15:3,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:0,p23:0,p24:5,p25:2,p26:5,p27:1,p28:5,p29:4,p30:6},output:{g1:0.55,g2:0.5,g3:0.55}},
    {input:{p1:1,p2:2,p3:16,p4:2,p5:3,p6:1,p7:2,p8:2,p9:4,p10:5,p11:3,p12:1,p13:3,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:0,p21:1,p22:0,p23:0,p24:4,p25:2,p26:2,p27:1,p28:2,p29:3,p30:4},output:{g1:0.6,g2:0.5,g3:0.55}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:3,p8:3,p9:5,p10:3,p11:3,p12:2,p13:1,p14:2,p15:1,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:5,p26:5,p27:4,p28:4,p29:5,p30:0},output:{g1:0.5,g2:0.5,g3:0.05}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:1,p8:2,p9:2,p10:3,p11:3,p12:1,p13:2,p14:1,p15:2,p16:0,p17:0,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:4,p25:4,p26:5,p27:3,p28:5,p29:5,p30:0},output:{g1:0.45,g2:0.4,g3:0.5}},
    {input:{p1:1,p2:2,p3:17,p4:2,p5:3,p6:1,p7:2,p8:1,p9:4,p10:5,p11:3,p12:1,p13:2,p14:1,p15:1,p16:0,p17:0,p18:1,p19:1,p20:1,p21:0,p22:1,p23:1,p24:3,p25:3,p26:2,p27:2,p28:2,p29:5,p30:8},output:{g1:0.4,g2:0.4,g3:0.45}},
    {input:{p1:1,p2:2,p3:17,p4:2,p5:3,p6:1,p7:3,p8:2,p9:5,p10:5,p11:3,p12:1,p13:2,p14:2,p15:2,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:4,p26:4,p27:1,p28:4,p29:3,p30:4},output:{g1:0.35,g2:0.3,g3:0.4}},
    {input:{p1:1,p2:2,p3:15,p4:1,p5:3,p6:1,p7:1,p8:2,p9:5,p10:5,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:4,p25:4,p26:4,p27:2,p28:4,p29:5,p30:2},output:{g1:0.4,g2:0.45,g3:0.5}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:1,p8:3,p9:4,p10:3,p11:3,p12:2,p13:1,p14:1,p15:1,p16:0,p17:0,p18:0,p19:0,p20:1,p21:0,p22:1,p23:0,p24:5,p25:3,p26:3,p27:1,p28:4,p29:2,p30:2},output:{g1:0.45,g2:0.4,g3:0.4}},
    {input:{p1:1,p2:2,p3:17,p4:2,p5:3,p6:1,p7:1,p8:1,p9:5,p10:3,p11:3,p12:1,p13:4,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:0,p22:0,p23:1,p24:5,p25:3,p26:5,p27:1,p28:5,p29:5,p30:0},output:{g1:0.4,g2:0.4,g3:0.4}},
    {input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:3,p8:2,p9:3,p10:3,p11:3,p12:1,p13:2,p14:1,p15:3,p16:0,p17:1,p18:0,p19:1,p20:0,p21:0,p22:0,p23:0,p24:4,p25:5,p26:2,p27:1,p28:1,p29:2,p30:10},output:{g1:0.4,g2:0.35,g3:0.4}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:3,p12:2,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:0,p22:1,p23:0,p24:4,p25:3,p26:5,p27:2,p28:4,p29:4,p30:0},output:{g1:0.45,g2:0.5,g3:0.55}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:2,p9:2,p10:3,p11:1,p12:2,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:2,p26:3,p27:1,p28:1,p29:3,p30:0},output:{g1:0.85,g2:0.85,g3:0.9}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:5,p25:1,p26:5,p27:1,p28:1,p29:4,p30:0},output:{g1:0.6,g2:0.6,g3:0.65}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:2,p10:2,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:4,p26:2,p27:1,p28:1,p29:3,p30:0},output:{g1:0.8,g2:0.8,g3:0.85}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:3,p8:4,p9:5,p10:5,p11:3,p12:2,p13:3,p14:1,p15:1,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:3,p25:4,p26:5,p27:2,p28:4,p29:2,p30:4},output:{g1:0.45,g2:0.45,g3:0.5}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:1,p8:0,p9:5,p10:5,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:2,p27:1,p28:1,p29:3,p30:0},output:{g1:0.8,g2:0.85,g3:0.9}},
    {input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:5,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:4,p27:1,p28:3,p29:5,p30:0},output:{g1:0.55,g2:0.45,g3:0.5}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:1,p8:3,p9:4,p10:3,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:1,p23:1,p24:4,p25:3,p26:5,p27:1,p28:1,p29:3,p30:0},output:{g1:0.7,g2:0.65,g3:0.65}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:3,p8:3,p9:5,p10:5,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:5,p27:1,p28:1,p29:4,p30:0},output:{g1:0.7,g2:0.7,g3:0.75}},
    {input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:4,p8:3,p9:1,p10:5,p11:3,p12:1,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:4,p27:4,p28:4,p29:4,p30:0},output:{g1:0.5,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:5,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:3,p25:4,p26:4,p27:1,p28:4,p29:5,p30:0},output:{g1:0.65,g2:0.6,g3:0.7}},
    {input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:3,p8:3,p9:5,p10:5,p11:2,p12:2,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:4,p25:3,p26:4,p27:1,p28:4,p29:4,p30:4},output:{g1:0.55,g2:0.45,g3:0.5}},
    {input:{p1:1,p2:2,p3:16,p4:2,p5:3,p6:1,p7:4,p8:2,p9:1,p10:3,p11:5,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:3,p27:3,p28:4,p29:3,p30:8},output:{g1:0.5,g2:0.45,g3:0.55}},
    {input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:4,p8:3,p9:5,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:1,p19:1,p20:1,p21:1,p22:1,p23:1,p24:5,p25:2,p26:3,p27:1,p28:1,p29:2,p30:4},output:{g1:0.55,g2:0.55,g3:0.65}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:3,p9:1,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:1,p19:1,p20:1,p21:1,p22:1,p23:0,p24:3,p25:4,p26:3,p27:2,p28:3,p29:3,p30:4},output:{g1:0.55,g2:0.5,g3:0.55}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:3,p8:3,p9:3,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:2,p26:3,p27:1,p28:2,p29:3,p30:0},output:{g1:0.55,g2:0.6,g3:0.65}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:2,p8:4,p9:3,p10:3,p11:2,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:5,p25:4,p26:2,p27:2,p28:3,p29:5,p30:0},output:{g1:0.85,g2:0.9,g3:0.85}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:3,p8:3,p9:5,p10:5,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:5,p25:3,p26:3,p27:2,p28:3,p29:1,p30:32},output:{g1:0.7,g2:0.65,g3:0.7}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:3,p8:2,p9:5,p10:5,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:1,p25:2,p26:2,p27:1,p28:2,p29:1,p30:8},output:{g1:0.7,g2:0.75,g3:0.8}},
    {input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:3,p8:3,p9:3,p10:3,p11:5,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:4,p27:2,p28:3,p29:4,p30:6},output:{g1:0.55,g2:0.65,g3:0.7}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:1,p8:2,p9:3,p10:3,p11:5,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:3,p25:3,p26:3,p27:1,p28:2,p29:3,p30:0},output:{g1:0.5,g2:0.45,g3:0.55}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:2,p8:1,p9:5,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:2,p26:3,p27:1,p28:2,p29:5,p30:0},output:{g1:0.65,g2:0.7,g3:0.8}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:2,p7:3,p8:3,p9:2,p10:5,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:1,p24:3,p25:3,p26:3,p27:1,p28:3,p29:3,p30:10},output:{g1:0.6,g2:0.65,g3:0.7}},
    {input:{p1:1,p2:2,p3:17,p4:2,p5:3,p6:1,p7:1,p8:2,p9:4,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:3,p25:1,p26:3,p27:1,p28:5,p29:3,p30:6},output:{g1:0.45,g2:0.45,g3:0.5}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:3,p9:3,p10:3,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:1,p29:2,p30:6},output:{g1:0.6,g2:0.6,g3:0.65}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:1,p8:1,p9:4,p10:3,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:3,p27:1,p28:1,p29:3,p30:0},output:{g1:0.6,g2:0.55,g3:0.6}},
    {input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:1,p8:2,p9:4,p10:3,p11:5,p12:5,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:4,p25:4,p26:4,p27:4,p28:5,p29:5,p30:16},output:{g1:0.5,g2:0.55,g3:0.6}},
    {input:{p1:1,p2:2,p3:16,p4:2,p5:3,p6:1,p7:3,p8:3,p9:3,p10:3,p11:2,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:2,p27:3,p28:4,p29:5,p30:0},output:{g1:0.55,g2:0.5,g3:0.5}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:2,p8:3,p9:5,p10:5,p11:1,p12:2,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:3,p27:1,p28:1,p29:3,p30:0},output:{g1:0.65,g2:0.6,g3:0.6}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:2,p8:4,p9:3,p10:3,p11:3,p12:2,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:2,p27:1,p28:1,p29:5,p30:8},output:{g1:0.7,g2:0.75,g3:0.8}},
    {input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:1,p11:1,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:2,p26:3,p27:1,p28:2,p29:5,p30:4},output:{g1:0.65,g2:0.65,g3:0.7}},
    {input:{p1:1,p2:2,p3:16,p4:2,p5:3,p6:1,p7:3,p8:3,p9:1,p10:5,p11:1,p12:2,p13:3,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:3,p25:3,p26:4,p27:3,p28:5,p29:3,p30:16},output:{g1:0.5,g2:0.55,g3:0.6}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:1,p11:1,p12:1,p13:2,p14:1,p15:1,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:4,p27:2,p28:3,p29:2,p30:30},output:{g1:0.7,g2:0.75,g3:0.8}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:1,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:5,p26:2,p27:1,p28:2,p29:3,p30:0},output:{g1:0.55,g2:0.5,g3:0.55}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:3,p9:2,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:5,p27:1,p28:5,p29:2,p30:2},output:{g1:0.7,g2:0.7,g3:0.75}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:3,p9:5,p10:5,p11:2,p12:1,p13:1,p14:2,p15:0,p16:1,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:4,p25:4,p26:3,p27:1,p28:3,p29:4,p30:4},output:{g1:0.55,g2:0.6,g3:0.6}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:0,p23:0,p24:4,p25:4,p26:4,p27:1,p28:3,p29:1,p30:0},output:{g1:0.7,g2:0.75,g3:0.75}},
    {input:{p1:1,p2:1,p3:17,p4:2,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:2,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:2,p27:1,p28:2,p29:3,p30:21},output:{g1:0.65,g2:0.65,g3:0.65}},
    {input:{p1:1,p2:1,p3:16,p4:2,p5:3,p6:1,p7:2,p8:2,p9:3,p10:3,p11:2,p12:1,p13:2,p14:4,p15:0,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:5,p25:3,p26:5,p27:1,p28:1,p29:5,p30:6},output:{g1:0.65,g2:0.65,g3:0.65}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:3,p8:4,p9:4,p10:3,p11:1,p12:1,p13:1,p14:3,p15:1,p16:0,p17:1,p18:1,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:4,p26:3,p27:3,p28:4,p29:5,p30:14},output:{g1:0.4,g2:0.45,g3:0.4}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:2,p7:3,p8:1,p9:3,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:2,p25:3,p26:3,p27:2,p28:2,p29:4,p30:2},output:{g1:0.55,g2:0.55,g3:0.6}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:3,p9:1,p10:5,p11:5,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:1,p25:3,p26:2,p27:1,p28:1,p29:1,p30:4},output:{g1:0.7,g2:0.75,g3:0.75}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:1,p12:1,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:2,p27:1,p28:4,p29:5,p30:2},output:{g1:0.6,g2:0.65,g3:0.65}},
    {input:{p1:1,p2:1,p3:17,p4:2,p5:3,p6:1,p7:4,p8:3,p9:1,p10:5,p11:2,p12:1,p13:2,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:4,p26:2,p27:1,p28:1,p29:4,p30:0},output:{g1:0.55,g2:0.6,g3:0.6}},
    {input:{p1:1,p2:1,p3:19,p4:1,p5:3,p6:1,p7:3,p8:3,p9:5,p10:5,p11:2,p12:5,p13:1,p14:4,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:2,p29:3,p30:4},output:{g1:0.6,g2:0.6,g3:0.6}},
    {input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:5,p25:3,p26:5,p27:4,p28:5,p29:3,p30:15},output:{g1:0.65,g2:0.6,g3:0.6}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:2,p7:2,p8:2,p9:5,p10:5,p11:2,p12:1,p13:1,p14:2,p15:0,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:3,p25:3,p26:4,p27:1,p28:1,p29:4,p30:0},output:{g1:0.65,g2:0.65,g3:0.65}},
    {input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:4,p27:2,p28:4,p29:5,p30:10},output:{g1:0.6,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:1,p3:17,p4:2,p5:3,p6:1,p7:4,p8:4,p9:3,p10:5,p11:5,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:5,p25:2,p26:1,p27:1,p28:2,p29:3,p30:6},output:{g1:0.6,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:3,p8:2,p9:5,p10:5,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:4,p27:1,p28:3,p29:1,p30:2},output:{g1:0.7,g2:0.8,g3:0.75}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:4,p8:3,p9:5,p10:5,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:3,p25:4,p26:5,p27:2,p28:4,p29:1,p30:16},output:{g1:0.55,g2:0.45,g3:0.5}},
    {input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:3,p8:3,p9:3,p10:2,p11:1,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:3,p25:2,p26:4,p27:2,p28:4,p29:4,p30:10},output:{g1:0.5,g2:0.5,g3:0.5}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:2,p8:3,p9:4,p10:5,p11:1,p12:2,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:3,p25:3,p26:3,p27:1,p28:4,p29:3,p30:4},output:{g1:0.6,g2:0.65,g3:0.65}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:2,p8:2,p9:4,p10:4,p11:3,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:1,p29:4,p30:0},output:{g1:0.6,g2:0.6,g3:0.65}},
    {input:{p1:1,p2:1,p3:17,p4:2,p5:3,p6:1,p7:2,p8:1,p9:4,p10:3,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:5,p27:1,p28:2,p29:5,p30:0},output:{g1:0.55,g2:0.5,g3:0.55}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:2,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:1,p24:4,p25:3,p26:4,p27:1,p28:1,p29:5,p30:12},output:{g1:0.6,g2:0.6,g3:0.6}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:3,p9:3,p10:1,p11:5,p12:1,p13:1,p14:2,p15:0,p16:1,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:2,p25:3,p26:1,p27:1,p28:1,p29:3,p30:0},output:{g1:0.65,g2:0.65,g3:0.7}},
    {input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:1,p12:1,p13:2,p14:2,p15:3,p16:0,p17:1,p18:1,p19:0,p20:1,p21:1,p22:1,p23:0,p24:3,p25:3,p26:3,p27:5,p28:5,p29:4,p30:9},output:{g1:0.5,g2:0.45,g3:0.5}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:3,p11:1,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:5,p25:3,p26:2,p27:1,p28:1,p29:5,p30:4},output:{g1:0.75,g2:0.8,g3:0.8}},
    {input:{p1:1,p2:1,p3:18,p4:2,p5:3,p6:1,p7:3,p8:1,p9:5,p10:5,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:5,p25:3,p26:3,p27:1,p28:1,p29:4,p30:4},output:{g1:0.4,g2:0.4,g3:0.4}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:3,p8:2,p9:5,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:5,p25:3,p26:4,p27:1,p28:3,p29:3,p30:2},output:{g1:0.85,g2:0.9,g3:0.85}},
    {input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:2,p8:3,p9:3,p10:3,p11:2,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:5,p25:3,p26:3,p27:1,p28:3,p29:3,p30:0},output:{g1:0.5,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:2,p8:1,p9:4,p10:5,p11:3,p12:1,p13:4,p14:2,p15:0,p16:1,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:2,p27:4,p28:5,p29:3,p30:2},output:{g1:0.45,g2:0.5,g3:0.55}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:2,p7:2,p8:1,p9:5,p10:5,p11:3,p12:1,p13:2,p14:3,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:3,p25:2,p26:3,p27:1,p28:2,p29:3,p30:0},output:{g1:0.75,g2:0.75,g3:0.8}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:4,p8:3,p9:2,p10:5,p11:2,p12:2,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:3,p25:2,p26:3,p27:1,p28:2,p29:3,p30:0},output:{g1:0.7,g2:0.6,g3:0.6}},
    {input:{p1:1,p2:2,p3:17,p4:2,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:3,p12:2,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:5,p26:2,p27:1,p28:1,p29:1,p30:0},output:{g1:0.6,g2:0.65,g3:0.65}},
    {input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:1,p11:2,p12:1,p13:1,p14:2,p15:0,p16:1,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:5,p26:5,p27:1,p28:3,p29:2,p30:0},output:{g1:0.65,g2:0.65,g3:0.65}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:2,p10:5,p11:2,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:4,p27:2,p28:4,p29:1,p30:0},output:{g1:0.65,g2:0.65,g3:0.7}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:1,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:3,p25:4,p26:2,p27:1,p28:1,p29:5,p30:2},output:{g1:0.45,g2:0.45,g3:0.45}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:3,p8:2,p9:4,p10:5,p11:2,p12:1,p13:2,p14:3,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:5,p25:3,p26:3,p27:1,p28:3,p29:2,p30:0},output:{g1:0.6,g2:0.6,g3:0.6}},
    {input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:1,p12:2,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:1,p23:1,p24:4,p25:4,p26:2,p27:5,p28:5,p29:4,p30:0},output:{g1:0.8,g2:0.8,g3:0.8}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:1,p9:5,p10:5,p11:1,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:5,p26:2,p27:1,p28:1,p29:5,p30:4},output:{g1:0.45,g2:0.5,g3:0.5}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:2,p7:4,p8:1,p9:5,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:5,p25:3,p26:3,p27:1,p28:2,p29:5,p30:0},output:{g1:0.7,g2:0.65,g3:0.65}},
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:2,p7:2,p8:4,p9:3,p10:5,p11:3,p12:1,p13:2,p14:2,p15:1,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:1,p29:3,p30:18},output:{g1:0.5,g2:0.5,g3:0.5}},
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:2,p8:2,p9:4,p10:3,p11:3,p12:1,p13:1,p14:2,p15:1,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:1,p24:5,p25:3,p26:1,p27:1,p28:1,p29:5,p30:16},output:{g1:0.45,g2:0.4,g3:0.5}},
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:3,p8:3,p9:5,p10:5,p11:3,p12:1,p13:2,p14:1,p15:1,p16:0,p17:0,p18:0,p19:0,p20:1,p21:0,p22:1,p23:0,p24:4,p25:1,p26:1,p27:1,p28:1,p29:3,p30:14},output:{g1:0.4,g2:0.35,g3:0.35}},
    {input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:4,p11:3,p12:5,p13:1,p14:1,p15:1,p16:0,p17:1,p18:0,p19:1,p20:0,p21:0,p22:1,p23:1,p24:4,p25:4,p26:3,p27:2,p28:2,p29:1,p30:26},output:{g1:0.35,g2:0.4,g3:0.4}},
    {input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:1,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:4,p25:2,p26:1,p27:1,p28:2,p29:5,p30:6},output:{g1:0.5,g2:0.4,g3:0.45}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:3,p8:2,p9:5,p10:5,p11:3,p12:2,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:5,p25:4,p26:2,p27:1,p28:1,p29:3,p30:4},output:{g1:0.7,g2:0.7,g3:0.75}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:1,p8:1,p9:4,p10:4,p11:3,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:2,p27:1,p28:2,p29:4,p30:10},output:{g1:0.55,g2:0.5,g3:0.5}},
    {input:{p1:1,p2:1,p3:16,p4:1,p5:3,p6:1,p7:1,p8:2,p9:5,p10:5,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:0,p22:1,p23:0,p24:5,p25:3,p26:5,p27:1,p28:2,p29:5,p30:4},output:{g1:0.6,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:1,p3:17,p4:2,p5:3,p6:1,p7:2,p8:1,p9:4,p10:3,p11:3,p12:1,p13:3,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:2,p25:1,p26:1,p27:1,p28:1,p29:3,p30:2},output:{g1:0.65,g2:0.65,g3:0.65}},
    {input:{p1:1,p2:1,p3:17,p4:2,p5:3,p6:2,p7:1,p8:4,p9:5,p10:5,p11:3,p12:5,p13:4,p14:1,p15:1,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:5,p26:4,p27:1,p28:1,p29:5,p30:14},output:{g1:0.45,g2:0.45,g3:0.4}},
    {input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:3,p11:2,p12:2,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:0,p22:1,p23:0,p24:5,p25:5,p26:4,p27:3,p28:5,p29:2,p30:16},output:{g1:0.4,g2:0.35,g3:0.4}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:2,p7:2,p8:2,p9:5,p10:5,p11:1,p12:1,p13:1,p14:1,p15:1,p16:0,p17:1,p18:0,p19:0,p20:0,p21:0,p22:1,p23:0,p24:3,p25:1,p26:2,p27:1,p28:1,p29:1,p30:8},output:{g1:0.55,g2:0.45,g3:0.5}},
    {input:{p1:1,p2:1,p3:17,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:3,p12:1,p13:2,p14:3,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:3,p29:5,p30:4},output:{g1:0.75,g2:0.7,g3:0.75}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:2,p7:4,p8:2,p9:1,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:2,p27:1,p28:1,p29:4,p30:4},output:{g1:0.75,g2:0.7,g3:0.7}},
    {input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:4,p8:3,p9:2,p10:5,p11:3,p12:1,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:2,p25:5,p26:5,p27:1,p28:4,p29:5,p30:8},output:{g1:0.75,g2:0.75,g3:0.75}},
    {input:{p1:1,p2:2,p3:17,p4:2,p5:3,p6:2,p7:4,p8:4,p9:1,p10:5,p11:3,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:3,p25:3,p26:3,p27:2,p28:3,p29:4,p30:0},output:{g1:0.6,g2:0.6,g3:0.6}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:3,p9:1,p10:5,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:5,p25:4,p26:5,p27:1,p28:1,p29:3,p30:7},output:{g1:0.7,g2:0.7,g3:0.75}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:3,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:1,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:2,p27:1,p28:2,p29:5,p30:4},output:{g1:0.7,g2:0.75,g3:0.75}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:3,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:1,p19:0,p20:1,p21:1,p22:1,p23:1,p24:5,p25:3,p26:1,p27:1,p28:4,p29:5,p30:2},output:{g1:0.55,g2:0.55,g3:0.6}},
    {input:{p1:1,p2:2,p3:17,p4:2,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:1,p12:2,p13:2,p14:3,p15:0,p16:0,p17:0,p18:0,p19:0,p20:0,p21:1,p22:1,p23:1,p24:4,p25:3,p26:3,p27:1,p28:1,p29:1,p30:2},output:{g1:0.65,g2:0.7,g3:0.75}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:3,p8:3,p9:3,p10:5,p11:1,p12:1,p13:2,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:2,p26:2,p27:2,p28:3,p29:5,p30:10},output:{g1:0.55,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:1,p17:0,p18:0,p19:0,p20:0,p21:1,p22:0,p23:1,p24:4,p25:3,p26:2,p27:1,p28:1,p29:4,p30:10},output:{g1:0.5,g2:0.45,g3:0.5}},
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:2,p8:1,p9:5,p10:5,p11:3,p12:5,p13:2,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:1,p24:4,p25:4,p26:4,p27:1,p28:1,p29:3,p30:10},output:{g1:0.6,g2:0.5,g3:0.55}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:2,p8:1,p9:5,p10:5,p11:3,p12:1,p13:3,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:1,p29:4,p30:7},output:{g1:0.75,g2:0.8,g3:0.8}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:3,p11:3,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:4,p27:1,p28:2,p29:5,p30:4},output:{g1:0.55,g2:0.5,g3:0.55}},
    {input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:2,p8:3,p9:5,p10:5,p11:3,p12:2,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:2,p26:2,p27:1,p28:1,p29:2,p30:2},output:{g1:0.45,g2:0.6,g3:0.65}},
    {input:{p1:1,p2:2,p3:22,p4:1,p5:3,p6:1,p7:3,p8:1,p9:3,p10:3,p11:5,p12:1,p13:1,p14:1,p15:3,p16:0,p17:0,p18:0,p19:0,p20:0,p21:0,p22:1,p23:1,p24:5,p25:4,p26:5,p27:5,p28:5,p29:1,p30:12},output:{g1:0.35,g2:0.4,g3:0.25}},
    {input:{p1:1,p2:2,p3:18,p4:2,p5:3,p6:1,p7:3,p8:3,p9:5,p10:3,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:3,p27:1,p28:3,p29:5,p30:8},output:{g1:0.5,g2:0.45,g3:0.5}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:0,p8:2,p9:5,p10:5,p11:5,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:4,p25:3,p26:2,p27:2,p28:4,p29:5,p30:0},output:{g1:0.55,g2:0.6,g3:0.55}},
    {input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:3,p8:2,p9:3,p10:5,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:0,p22:1,p23:0,p24:4,p25:4,p26:5,p27:2,p28:4,p29:5,p30:8},output:{g1:0.35,g2:0.4,g3:0.35}},
    {input:{p1:1,p2:2,p3:16,p4:1,p5:3,p6:1,p7:3,p8:3,p9:4,p10:5,p11:2,p12:5,p13:3,p14:2,p15:1,p16:1,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:5,p25:3,p26:3,p27:1,p28:3,p29:2,p30:4},output:{g1:0.45,g2:0.55,g3:0.5}},
    {input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:2,p8:1,p9:3,p10:3,p11:5,p12:1,p13:1,p14:1,p15:2,p16:0,p17:0,p18:0,p19:0,p20:0,p21:0,p22:1,p23:0,p24:3,p25:2,p26:5,p27:2,p28:5,p29:5,p30:4},output:{g1:0.35,g2:0.4,g3:0.3}},
    {input:{p1:1,p2:2,p3:16,p4:2,p5:3,p6:1,p7:2,p8:1,p9:5,p10:5,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:0,p23:0,p24:3,p25:3,p26:2,p27:1,p28:3,p29:3,p30:2},output:{g1:0.7,g2:0.65,g3:0.6}},
    {input:{p1:1,p2:2,p3:17,p4:2,p5:3,p6:1,p7:2,p8:1,p9:5,p10:5,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:4,p25:4,p26:2,p27:2,p28:4,p29:5,p30:0},output:{g1:0.6,g2:0.6,g3:0.65}},
    {input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:1,p8:1,p9:2,p10:5,p11:3,p12:1,p13:2,p14:1,p15:1,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:4,p27:1,p28:2,p29:5,p30:0},output:{g1:0.45,g2:0.5,g3:0.5}},
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:2,p7:2,p8:1,p9:5,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:1,p24:4,p25:3,p26:4,p27:1,p28:3,p29:5,p30:2},output:{g1:0.6,g2:0.6,g3:0.65}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:4,p8:2,p9:1,p10:3,p11:2,p12:1,p13:1,p14:4,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:3,p27:1,p28:1,p29:4,p30:2},output:{g1:0.7,g2:0.75,g3:0.85}},
    {input:{p1:1,p2:1,p3:19,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:3,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:1,p29:5,p30:0},output:{g1:0.5,g2:0.5,g3:0.55}},
    {input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:2,p8:1,p9:3,p10:5,p11:3,p12:1,p13:3,p14:2,p15:1,p16:0,p17:0,p18:0,p19:1,p20:0,p21:0,p22:1,p23:0,p24:4,p25:4,p26:5,p27:4,p28:4,p29:5,p30:4},output:{g1:0.55,g2:0.5,g3:0.55}},
    {input:{p1:1,p2:1,p3:17,p4:2,p5:3,p6:1,p7:4,p8:2,p9:5,p10:5,p11:3,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:4,p27:1,p28:3,p29:5,p30:2},output:{g1:0.55,g2:0.6,g3:0.7}},
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:4,p11:1,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:0,p23:0,p24:4,p25:4,p26:3,p27:2,p28:3,p29:3,p30:4},output:{g1:0.55,g2:0.6,g3:0.7}},
    {input:{p1:1,p2:1,p3:18,p4:2,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:1,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:3,p25:2,p26:3,p27:1,p28:1,p29:5,p30:4},output:{g1:0.55,g2:0.55,g3:0.65}},
    {input:{p1:1,p2:2,p3:19,p4:1,p5:3,p6:2,p7:4,p8:3,p9:3,p10:4,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:1,p27:1,p28:1,p29:1,p30:4},output:{g1:0.55,g2:0.65,g3:0.7}},
    {input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:2,p8:1,p9:5,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:2,p26:4,p27:1,p28:2,p29:4,p30:2},output:{g1:0.8,g2:0.8,g3:0.8}},
    {input:{p1:1,p2:2,p3:17,p4:2,p5:3,p6:1,p7:2,p8:2,p9:5,p10:3,p11:5,p12:1,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:0,p21:0,p22:0,p23:0,p24:5,p25:2,p26:2,p27:1,p28:1,p29:4,p30:0},output:{g1:0.45,g2:0.5,g3:0.5}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:3,p11:3,p12:2,p13:1,p14:4,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:3,p25:4,p26:1,p27:1,p28:1,p29:2,p30:2},output:{g1:0.5,g2:0.55,g3:0.6}},
    {input:{p1:1,p2:1,p3:20,p4:2,p5:3,p6:1,p7:2,p8:1,p9:5,p10:5,p11:3,p12:5,p13:2,p14:2,p15:0,p16:0,p17:1,p18:1,p19:1,p20:1,p21:0,p22:1,p23:1,p24:1,p25:2,p26:3,p27:1,p28:2,p29:2,p30:8},output:{g1:0.5,g2:0.6,g3:0.6}},
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:4,p8:3,p9:3,p10:5,p11:1,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:3,p25:1,p26:2,p27:1,p28:3,p29:2,p30:2},output:{g1:0.75,g2:0.75,g3:0.75}},
    {input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:4,p8:3,p9:1,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:4,p25:3,p26:2,p27:1,p28:1,p29:3,p30:2},output:{g1:0.5,g2:0.5,g3:0.55}},
    {input:{p1:1,p2:2,p3:18,p4:2,p5:3,p6:1,p7:3,p8:2,p9:5,p10:5,p11:3,p12:1,p13:1,p14:3,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:0,p23:0,p24:5,p25:3,p26:2,p27:1,p28:1,p29:3,p30:2},output:{g1:0.5,g2:0.55,g3:0.6}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:3,p8:3,p9:5,p10:5,p11:1,p12:1,p13:1,p14:3,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:0,p23:0,p24:3,p25:2,p26:3,p27:1,p28:1,p29:4,p30:2},output:{g1:0.75,g2:0.6,g3:0.65}},
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:2,p8:2,p9:4,p10:3,p11:1,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:3,p27:1,p28:1,p29:3,p30:0},output:{g1:0.55,g2:0.6,g3:0.65}},
    {input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:1,p12:2,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:0,p22:1,p23:0,p24:4,p25:4,p26:4,p27:2,p28:3,p29:4,p30:8},output:{g1:0.4,g2:0.4,g3:0.45}},
    {input:{p1:1,p2:2,p3:18,p4:2,p5:3,p6:2,p7:3,p8:4,p9:5,p10:5,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:5,p27:3,p28:4,p29:1,p30:6},output:{g1:0.75,g2:0.8,g3:0.8}},
    {input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:3,p8:1,p9:3,p10:5,p11:5,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:5,p25:4,p26:4,p27:3,p28:4,p29:5,p30:0},output:{g1:0.55,g2:0.55,g3:0.7}},
    {input:{p1:1,p2:1,p3:18,p4:2,p5:3,p6:1,p7:4,p8:4,p9:1,p10:5,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:4,p27:2,p28:2,p29:4,p30:8},output:{g1:0.5,g2:0.55,g3:0.6}},
    {input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:4,p8:2,p9:2,p10:5,p11:2,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:5,p25:4,p26:5,p27:1,p28:3,p29:5,p30:4},output:{g1:0.5,g2:0.6,g3:0.7}},
    {input:{p1:1,p2:1,p3:18,p4:2,p5:3,p6:1,p7:2,p8:1,p9:5,p10:5,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:0,p22:1,p23:1,p24:4,p25:3,p26:5,p27:1,p28:2,p29:3,p30:12},output:{g1:0.4,g2:0.45,g3:0.5}},
    {input:{p1:1,p2:1,p3:19,p4:1,p5:3,p6:1,p7:3,p8:3,p9:5,p10:3,p11:1,p12:5,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:5,p27:3,p28:3,p29:5,p30:16},output:{g1:0.55,g2:0.6,g3:0.6}},
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:2,p8:3,p9:5,p10:3,p11:2,p12:2,p13:1,p14:4,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:5,p26:5,p27:1,p28:3,p29:2,p30:10},output:{g1:0.8,g2:0.8,g3:0.8}},
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:1,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:0,p23:0,p24:4,p25:4,p26:3,p27:1,p28:1,p29:3,p30:2},output:{g1:0.65,g2:0.65,g3:0.65}},
    {input:{p1:1,p2:2,p3:17,p4:2,p5:3,p6:1,p7:1,p8:2,p9:4,p10:4,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:0,p23:1,p24:3,p25:5,p26:2,p27:2,p28:2,p29:1,p30:2},output:{g1:0.8,g2:0.85,g3:0.9}},
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:2,p8:1,p9:5,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:2,p26:5,p27:1,p28:2,p29:1,p30:8},output:{g1:0.7,g2:0.7,g3:0.75}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:2,p8:4,p9:4,p10:2,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:3,p27:1,p28:1,p29:1,p30:6},output:{g1:0.75,g2:0.8,g3:0.8}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:5,p11:3,p12:1,p13:2,p14:2,p15:0,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:4,p26:4,p27:2,p28:3,p29:5,p30:6},output:{g1:0.6,g2:0.6,g3:0.6}},
    {input:{p1:1,p2:1,p3:18,p4:2,p5:3,p6:2,p7:3,p8:2,p9:5,p10:3,p11:1,p12:1,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:0,p21:0,p22:1,p23:1,p24:4,p25:1,p26:1,p27:1,p28:1,p29:5,p30:15},output:{g1:0.6,g2:0.45,g3:0.5}},
    {input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:3,p11:1,p12:1,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:3,p25:2,p26:4,p27:1,p28:4,p29:3,p30:6},output:{g1:0.55,g2:0.6,g3:0.6}},
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:4,p8:4,p9:2,p10:2,p11:2,p12:2,p13:1,p14:2,p15:1,p16:1,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:2,p25:4,p26:4,p27:1,p28:1,p29:4,p30:2},output:{g1:0.7,g2:0.6,g3:0.65}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:3,p11:2,p12:2,p13:3,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:2,p26:3,p27:1,p28:1,p29:1,p30:8},output:{g1:0.65,g2:0.75,g3:0.75}},
    {input:{p1:1,p2:1,p3:19,p4:2,p5:3,p6:1,p7:3,p8:2,p9:3,p10:3,p11:2,p12:2,p13:1,p14:2,p15:1,p16:1,p17:1,p18:0,p19:0,p20:1,p21:0,p22:1,p23:0,p24:3,p25:3,p26:3,p27:4,p28:3,p29:3,p30:0},output:{g1:0.45,g2:0.4,g3:0.5}},
    {input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:4,p8:3,p9:1,p10:3,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:3,p27:1,p28:2,p29:1,p30:0},output:{g1:0.5,g2:0.5,g3:0.5}},
    {input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:1,p8:2,p9:4,p10:5,p11:1,p12:5,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:0,p21:0,p22:1,p23:0,p24:3,p25:4,p26:4,p27:2,p28:4,p29:4,p30:10},output:{g1:0.5,g2:0.5,g3:0.55}},
    {input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:2,p7:4,p8:1,p9:3,p10:5,p11:1,p12:1,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:5,p26:4,p27:2,p28:4,p29:5,p30:22},output:{g1:0.55,g2:0.55,g3:0.5}},
    {input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:2,p7:3,p8:2,p9:1,p10:3,p11:1,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:4,p27:3,p28:4,p29:3,p30:18},output:{g1:0.65,g2:0.65,g3:0.65}},
    {input:{p1:1,p2:1,p3:18,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:2,p12:1,p13:2,p14:4,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:5,p25:2,p26:2,p27:1,p28:1,p29:3,p30:2},output:{g1:0.85,g2:0.85,g3:0.9}},
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:1,p12:1,p13:2,p14:2,p15:0,p16:1,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:4,p27:1,p28:1,p29:4,p30:0},output:{g1:0.6,g2:0.65,g3:0.65}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:5,p25:4,p26:5,p27:1,p28:2,p29:5,p30:12},output:{g1:0.6,g2:0.6,g3:0.7}},
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:2,p8:1,p9:5,p10:5,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:1,p27:1,p28:1,p29:5,p30:10},output:{g1:0.6,g2:0.65,g3:0.7}},
    {input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:2,p12:2,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:2,p29:4,p30:0},output:{g1:0.6,g2:0.6,g3:0.6}},
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:2,p8:2,p9:4,p10:4,p11:5,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:2,p29:2,p30:0},output:{g1:0.9,g2:0.9,g3:0.9}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:1,p8:1,p9:3,p10:1,p11:2,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:1,p29:3,p30:0},output:{g1:0.65,g2:0.65,g3:0.7}},
    {input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:2,p8:1,p9:3,p10:3,p11:2,p12:1,p13:1,p14:3,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:4,p27:1,p28:3,p29:2,p30:0},output:{g1:0.7,g2:0.75,g3:0.75}},
    {input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:2,p7:4,p8:4,p9:1,p10:1,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:3,p27:1,p28:1,p29:2,p30:0},output:{g1:0.85,g2:0.85,g3:0.85}},
    {input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:4,p8:2,p9:1,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:2,p27:1,p28:4,p29:5,p30:2},output:{g1:0.75,g2:0.8,g3:0.8}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:4,p8:3,p9:2,p10:3,p11:2,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:2,p27:1,p28:2,p29:3,p30:0},output:{g1:0.85,g2:0.9,g3:0.9}},
    {input:{p1:1,p2:1,p3:17,p4:2,p5:3,p6:1,p7:3,p8:1,p9:3,p10:5,p11:2,p12:1,p13:2,p14:4,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:3,p25:1,p26:2,p27:1,p28:1,p29:3,p30:0},output:{g1:0.9,g2:0.95,g3:0.95}},
    {input:{p1:1,p2:2,p3:18,p4:2,p5:3,p6:1,p7:3,p8:2,p9:3,p10:5,p11:2,p12:1,p13:2,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:2,p27:1,p28:1,p29:4,p30:0},output:{g1:0.7,g2:0.75,g3:0.75}},
    {input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:3,p8:3,p9:2,p10:5,p11:1,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:3,p27:1,p28:3,p29:5,p30:0},output:{g1:0.7,g2:0.75,g3:0.75}},
    {input:{p1:1,p2:1,p3:19,p4:1,p5:3,p6:1,p7:4,p8:4,p9:2,p10:5,p11:2,p12:5,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:2,p25:3,p26:4,p27:2,p28:3,p29:2,p30:2},output:{g1:0.7,g2:0.65,g3:0.65}},
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:4,p8:3,p9:5,p10:5,p11:1,p12:5,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:4,p26:5,p27:1,p28:2,p29:2,p30:0},output:{g1:0.65,g2:0.7,g3:0.7}},
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:4,p8:3,p9:5,p10:5,p11:2,p12:2,p13:1,p14:4,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:1,p29:3,p30:0},output:{g1:0.8,g2:0.85,g3:0.85}},
    {input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:1,p11:1,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:1,p25:4,p26:2,p27:2,p28:2,p29:1,p30:0},output:{g1:0.9,g2:0.9,g3:0.85}},
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:2,p7:4,p8:4,p9:2,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:1,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:2,p26:4,p27:1,p28:1,p29:4,p30:0},output:{g1:0.7,g2:0.75,g3:0.75}},
    {input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:4,p8:4,p9:5,p10:1,p11:1,p12:2,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:1,p26:1,p27:2,p28:2,p29:5,p30:0},output:{g1:0.6,g2:0.65,g3:0.65}},
    {input:{p1:1,p2:1,p3:17,p4:2,p5:3,p6:1,p7:4,p8:4,p9:3,p10:3,p11:2,p12:1,p13:2,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:4,p27:1,p28:1,p29:5,p30:0},output:{g1:0.35,g2:0.35,g3:0.4}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:4,p8:2,p9:5,p10:5,p11:2,p12:1,p13:2,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:1,p29:3,p30:0},output:{g1:0.8,g2:0.8,g3:0.8}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:3,p8:2,p9:2,p10:2,p11:2,p12:2,p13:1,p14:4,p15:0,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:5,p25:2,p26:2,p27:1,p28:2,p29:5,p30:0},output:{g1:0.9,g2:0.9,g3:0.9}},
    {input:{p1:1,p2:2,p3:19,p4:2,p5:3,p6:1,p7:2,p8:1,p9:4,p10:3,p11:3,p12:1,p13:2,p14:3,p15:1,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:1,p27:1,p28:1,p29:5,p30:0},output:{g1:0.45,g2:0.5,g3:0.55}},
    {input:{p1:1,p2:2,p3:20,p4:1,p5:3,p6:2,p7:3,p8:2,p9:3,p10:5,p11:3,p12:5,p13:1,p14:1,p15:2,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:5,p25:5,p26:3,p27:1,p28:1,p29:5,p30:0},output:{g1:0.7,g2:0.75,g3:0.75}},
    {input:{p1:1,p2:2,p3:19,p4:2,p5:3,p6:1,p7:3,p8:3,p9:5,p10:3,p11:2,p12:2,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:0,p23:1,p24:4,p25:5,p26:3,p27:1,p28:2,p29:5,p30:0},output:{g1:0.5,g2:0.5,g3:0.55}},
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:1,p8:4,p9:5,p10:1,p11:1,p12:1,p13:1,p14:2,p15:0,p16:1,p17:1,p18:0,p19:0,p20:0,p21:1,p22:0,p23:1,p24:3,p25:4,p26:4,p27:1,p28:2,p29:5,p30:2},output:{g1:0.5,g2:0.5,g3:0.55}},
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:2,p8:1,p9:3,p10:5,p11:3,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:3,p27:1,p28:2,p29:1,p30:2},output:{g1:0.6,g2:0.6,g3:0.75}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:2,p8:3,p9:5,p10:5,p11:3,p12:2,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:2,p26:1,p27:1,p28:1,p29:3,p30:2},output:{g1:0.55,g2:0.6,g3:0.7}},
    {input:{p1:1,p2:1,p3:17,p4:2,p5:3,p6:1,p7:4,p8:4,p9:1,p10:1,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:4,p27:1,p28:1,p29:5,p30:2},output:{g1:0.75,g2:0.8,g3:0.85}},
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:4,p8:3,p9:5,p10:5,p11:3,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:4,p27:1,p28:1,p29:5,p30:2},output:{g1:0.7,g2:0.75,g3:0.85}},
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:4,p8:3,p9:2,p10:3,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:3,p25:2,p26:4,p27:1,p28:4,p29:1,p30:8},output:{g1:0.6,g2:0.6,g3:0.75}},
    {input:{p1:1,p2:1,p3:17,p4:2,p5:3,p6:1,p7:3,p8:4,p9:4,p10:3,p11:3,p12:2,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:4,p25:3,p26:4,p27:2,p28:5,p29:5,p30:2},output:{g1:0.75,g2:0.75,g3:0.85}},
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:3,p8:3,p9:4,p10:5,p11:3,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:1,p26:4,p27:1,p28:1,p29:3,p30:8},output:{g1:0.55,g2:0.6,g3:0.7}},
    {input:{p1:1,p2:2,p3:19,p4:1,p5:3,p6:1,p7:4,p8:2,p9:2,p10:5,p11:3,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:5,p25:4,p26:4,p27:1,p28:1,p29:1,p30:9},output:{g1:0.55,g2:0.5,g3:0.5}},
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:4,p27:3,p28:3,p29:5,p30:0},output:{g1:0.6,g2:0.55,g3:0.65}},
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:3,p8:4,p9:5,p10:5,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:5,p25:4,p26:4,p27:1,p28:1,p29:1,p30:4},output:{g1:0.55,g2:0.6,g3:0.7}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:4,p8:4,p9:2,p10:2,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:4,p27:1,p28:2,p29:5,p30:2},output:{g1:0.7,g2:0.75,g3:0.85}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:2,p7:4,p8:3,p9:3,p10:3,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:5,p25:2,p26:2,p27:1,p28:2,p29:5,p30:14},output:{g1:0.75,g2:0.7,g3:0.85}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:2,p7:3,p8:3,p9:3,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:3,p27:1,p28:1,p29:5,p30:0},output:{g1:0.6,g2:0.6,g3:0.65}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:2,p8:1,p9:5,p10:5,p11:1,p12:2,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:3,p27:2,p28:2,p29:2,p30:2},output:{g1:0.55,g2:0.6,g3:0.7}},
    {input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:4,p8:4,p9:5,p10:5,p11:2,p12:2,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:5,p27:3,p28:4,p29:5,p30:2},output:{g1:0.4,g2:0.45,g3:0.55}},
    {input:{p1:1,p2:1,p3:19,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:3,p12:5,p13:3,p14:3,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:0,p22:0,p23:1,p24:1,p25:5,p26:5,p27:4,p28:3,p29:5,p30:12},output:{g1:0.5,g2:0.5,g3:0.55}},
    {input:{p1:1,p2:1,p3:19,p4:1,p5:3,p6:2,p7:1,p8:1,p9:5,p10:5,p11:3,p12:5,p13:3,p14:2,p15:2,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:1,p24:5,p25:3,p26:4,p27:1,p28:1,p29:4,p30:2},output:{g1:0.4,g2:0.4,g3:0.45}},
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:5,p27:2,p28:4,p29:5,p30:2},output:{g1:0.5,g2:0.5,g3:0.5}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:1,p24:4,p25:2,p26:2,p27:1,p28:1,p29:3,p30:4},output:{g1:0.7,g2:0.65,g3:0.65}},
    {input:{p1:1,p2:1,p3:17,p4:2,p5:3,p6:1,p7:2,p8:2,p9:3,p10:3,p11:3,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:3,p25:3,p26:2,p27:2,p28:2,p29:3,p30:0},output:{g1:0.55,g2:0.55,g3:0.5}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:3,p8:1,p9:3,p10:3,p11:3,p12:2,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:3,p25:4,p26:3,p27:2,p28:3,p29:5,p30:0},output:{g1:0.85,g2:0.9,g3:0.85}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:0,p8:2,p9:4,p10:4,p11:1,p12:2,p13:2,p14:3,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:3,p25:3,p26:3,p27:2,p28:3,p29:2,p30:0},output:{g1:0.7,g2:0.7,g3:0.75}},
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:1,p12:1,p13:2,p14:3,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:5,p26:5,p27:1,p28:2,p29:2,p30:0},output:{g1:0.7,g2:0.7,g3:0.7}},
    {input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:4,p8:4,p9:5,p10:5,p11:3,p12:1,p13:1,p14:3,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:2,p28:2,p29:3,p30:0},output:{g1:0.65,g2:0.7,g3:0.65}},
    {input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:1,p7:3,p8:3,p9:5,p10:3,p11:2,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:4,p25:3,p26:5,p27:3,p28:5,p29:5,p30:0},output:{g1:0.85,g2:0.9,g3:0.85}},
    {input:{p1:1,p2:2,p3:17,p4:2,p5:3,p6:1,p7:2,p8:2,p9:3,p10:5,p11:3,p12:1,p13:4,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:5,p27:5,p28:5,p29:4,p30:2},output:{g1:0.55,g2:0.5,g3:0.5}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:3,p11:3,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:4,p27:1,p28:3,p29:4,p30:0},output:{g1:0.65,g2:0.6,g3:0.65}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:1,p11:3,p12:1,p13:2,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:1,p24:4,p25:3,p26:3,p27:1,p28:2,p29:4,p30:4},output:{g1:0.75,g2:0.7,g3:0.75}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:3,p8:3,p9:4,p10:5,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:1,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:5,p27:2,p28:5,p29:5,p30:2},output:{g1:0.55,g2:0.6,g3:0.55}},
    {input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:3,p12:1,p13:1,p14:4,p15:0,p16:0,p17:1,p18:1,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:5,p26:5,p27:2,p28:4,p29:5,p30:0},output:{g1:0.55,g2:0.55,g3:0.6}},
    {input:{p1:1,p2:2,p3:19,p4:2,p5:3,p6:1,p7:3,p8:2,p9:4,p10:3,p11:1,p12:5,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:0,p23:1,p24:5,p25:3,p26:4,p27:2,p28:2,p29:5,p30:0},output:{g1:0.55,g2:0.5,g3:0.5}},
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:2,p8:2,p9:4,p10:5,p11:3,p12:1,p13:4,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:0,p23:1,p24:4,p25:2,p26:5,p27:1,p28:1,p29:2,p30:2},output:{g1:0.5,g2:0.45,g3:0.5}},
    {input:{p1:1,p2:1,p3:17,p4:2,p5:3,p6:1,p7:2,p8:4,p9:4,p10:5,p11:3,p12:2,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:4,p26:3,p27:1,p28:1,p29:5,p30:0},output:{g1:0.75,g2:0.75,g3:0.75}},
    {input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:2,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:5,p25:4,p26:2,p27:1,p28:2,p29:5,p30:6},output:{g1:0.75,g2:0.7,g3:0.75}},
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:3,p8:3,p9:3,p10:3,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:4,p27:1,p28:1,p29:4,p30:8},output:{g1:0.5,g2:0.55,g3:0.6}},
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:1,p12:5,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:1,p23:1,p24:4,p25:3,p26:3,p27:1,p28:1,p29:2,p30:0},output:{g1:0.5,g2:0.45,g3:0.6}},
    {input:{p1:1,p2:1,p3:18,p4:2,p5:3,p6:1,p7:2,p8:2,p9:4,p10:5,p11:3,p12:1,p13:2,p14:4,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:4,p25:4,p26:4,p27:1,p28:1,p29:4,p30:6},output:{g1:0.7,g2:0.65,g3:0.7}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:3,p8:4,p9:3,p10:5,p11:3,p12:1,p13:1,p14:3,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:5,p27:1,p28:3,p29:5,p30:8},output:{g1:0.55,g2:0.65,g3:0.7}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:3,p8:2,p9:5,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:2,p27:2,p28:3,p29:2,p30:0},output:{g1:0.6,g2:0.65,g3:0.75}},
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:3,p8:3,p9:3,p10:3,p11:1,p12:1,p13:1,p14:4,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:3,p27:1,p28:1,p29:1,p30:4},output:{g1:0.7,g2:0.7,g3:0.75}},
    {input:{p1:1,p2:1,p3:17,p4:2,p5:3,p6:2,p7:3,p8:2,p9:5,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:2,p28:3,p29:2,p30:0},output:{g1:0.7,g2:0.7,g3:0.8}},
    {input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:3,p11:1,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:2,p28:2,p29:2,p30:0},output:{g1:0.6,g2:0.6,g3:0.65}},
    {input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:3,p8:4,p9:3,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:3,p27:1,p28:3,p29:5,p30:6},output:{g1:0.8,g2:0.8,g3:0.85}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:2,p7:2,p8:2,p9:4,p10:4,p11:1,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:3,p25:3,p26:1,p27:1,p28:2,p29:4,p30:18},output:{g1:0.5,g2:0.6,g3:0.7}},
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:2,p8:3,p9:4,p10:5,p11:3,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:2,p29:3,p30:0},output:{g1:0.55,g2:0.6,g3:0.7}},
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:3,p8:2,p9:5,p10:3,p11:5,p12:1,p13:1,p14:3,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:5,p25:4,p26:3,p27:2,p28:3,p29:1,p30:4},output:{g1:0.7,g2:0.8,g3:0.85}},
    {input:{p1:1,p2:2,p3:18,p4:2,p5:3,p6:1,p7:4,p8:3,p9:1,p10:3,p11:3,p12:1,p13:1,p14:3,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:5,p25:3,p26:2,p27:1,p28:2,p29:4,p30:4},output:{g1:0.75,g2:0.7,g3:0.85}},
    {input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:4,p8:3,p9:1,p10:5,p11:3,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:5,p25:4,p26:5,p27:2,p28:3,p29:5,p30:0},output:{g1:0.7,g2:0.65,g3:0.7}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:4,p8:3,p9:2,p10:5,p11:2,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:4,p26:3,p27:1,p28:3,p29:4,p30:0},output:{g1:0.55,g2:0.6,g3:0.65}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:2,p8:1,p9:3,p10:5,p11:3,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:4,p27:2,p28:2,p29:1,p30:10},output:{g1:0.6,g2:0.75,g3:0.75}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:2,p8:1,p9:3,p10:5,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:5,p27:2,p28:4,p29:4,p30:4},output:{g1:0.6,g2:0.8,g3:0.8}},
    {input:{p1:1,p2:1,p3:19,p4:1,p5:3,p6:2,p7:2,p8:3,p9:4,p10:5,p11:1,p12:5,p13:2,p14:1,p15:1,p16:0,p17:0,p18:0,p19:0,p20:1,p21:0,p22:1,p23:0,p24:2,p25:2,p26:3,p27:3,p28:4,p29:5,p30:16},output:{g1:0.5,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:3,p8:1,p9:5,p10:4,p11:1,p12:1,p13:1,p14:1,p15:1,p16:0,p17:1,p18:1,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:1,p26:2,p27:1,p28:1,p29:3,p30:6},output:{g1:0.5,g2:0.65,g3:0.65}},
    {input:{p1:1,p2:1,p3:21,p4:1,p5:3,p6:1,p7:4,p8:4,p9:5,p10:5,p11:2,p12:5,p13:1,p14:3,p15:2,p16:0,p17:0,p18:1,p19:1,p20:1,p21:1,p22:1,p23:0,p24:3,p25:3,p26:2,p27:1,p28:1,p29:5,p30:0},output:{g1:0.45,g2:0.6,g3:0.6}},
    {input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:3,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:0,p21:0,p22:1,p23:0,p24:4,p25:4,p26:4,p27:1,p28:3,p29:3,p30:11},output:{g1:0.45,g2:0.55,g3:0.6}},
    {input:{p1:1,p2:2,p3:18,p4:1,p5:3,p6:2,p7:3,p8:4,p9:5,p10:5,p11:2,p12:5,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:5,p27:1,p28:4,p29:2,p30:9},output:{g1:0.65,g2:0.7,g3:0.75}},
    {input:{p1:1,p2:1,p3:17,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:3,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:4,p27:1,p28:3,p29:4,p30:0},output:{g1:0.65,g2:0.85,g3:0.85}},
    {input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:2,p7:4,p8:4,p9:2,p10:5,p11:2,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:2,p27:1,p28:2,p29:4,p30:2},output:{g1:0.6,g2:0.75,g3:0.75}},
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:4,p8:2,p9:1,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:2,p27:1,p28:1,p29:3,p30:0},output:{g1:0.7,g2:0.85,g3:0.85}},
    {input:{p1:1,p2:2,p3:21,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:3,p12:5,p13:2,p14:2,p15:2,p16:0,p17:1,p18:0,p19:1,p20:1,p21:0,p22:1,p23:1,p24:5,p25:3,p26:3,p27:5,p28:2,p29:4,p30:21},output:{g1:0.45,g2:0.5,g3:0.5}},
    {input:{p1:1,p2:1,p3:20,p4:2,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:2,p12:5,p13:2,p14:3,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:3,p25:2,p26:2,p27:1,p28:3,p29:3,p30:8},output:{g1:0.55,g2:0.75,g3:0.75}},
    {input:{p1:1,p2:1,p3:19,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:5,p11:1,p12:5,p13:1,p14:1,p15:1,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:3,p25:2,p26:5,p27:4,p28:4,p29:5,p30:5},output:{g1:0.45,g2:0.5,g3:0.55}},
    {input:{p1:1,p2:2,p3:17,p4:1,p5:3,p6:2,p7:3,p8:2,p9:5,p10:5,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:4,p27:1,p28:2,p29:5,p30:10},output:{g1:0.8,g2:0.9,g3:0.9}},
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:3,p8:2,p9:4,p10:5,p11:2,p12:2,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:4,p27:1,p28:2,p29:2,p30:5},output:{g1:0.7,g2:0.85,g3:0.85}},
    {input:{p1:1,p2:2,p3:18,p4:2,p5:3,p6:1,p7:2,p8:3,p9:5,p10:3,p11:2,p12:2,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:3,p25:1,p26:3,p27:4,p28:5,p29:4,p30:13},output:{g1:0.65,g2:0.7,g3:0.7}},
    {input:{p1:1,p2:2,p3:19,p4:1,p5:3,p6:1,p7:2,p8:1,p9:5,p10:5,p11:2,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:4,p27:1,p28:4,p29:4,p30:10},output:{g1:0.35,g2:0.55,g3:0.55}},
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:2,p7:2,p8:2,p9:3,p10:5,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:1,p26:4,p27:1,p28:3,p29:4,p30:10},output:{g1:0.7,g2:0.85,g3:0.85}},
    {input:{p1:1,p2:1,p3:20,p4:1,p5:3,p6:1,p7:1,p8:0,p9:5,p10:5,p11:2,p12:1,p13:2,p14:1,p15:1,p16:1,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:5,p25:3,p26:1,p27:1,p28:1,p29:5,p30:5},output:{g1:0.4,g2:0.5,g3:0.5}},
    {input:{p1:1,p2:1,p3:18,p4:1,p5:3,p6:1,p7:3,p8:2,p9:3,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:1,p24:3,p25:1,p26:2,p27:1,p28:2,p29:1,p30:4},output:{g1:0.5,g2:0.65,g3:0.65}},
    {input:{p1:2,p2:1,p3:16,p4:1,p5:3,p6:1,p7:1,p8:3,p9:4,p10:5,p11:5,p12:2,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:0,p22:1,p23:1,p24:4,p25:3,p26:3,p27:1,p28:3,p29:5,p30:11},output:{g1:0.5,g2:0.55,g3:0.55}},
    {input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:3,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:4,p27:1,p28:1,p29:5,p30:0},output:{g1:0.6,g2:0.6,g3:0.6}},
    {input:{p1:2,p2:1,p3:15,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:3,p11:5,p12:1,p13:1,p14:1,p15:1,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:1,p24:4,p25:1,p26:3,p27:1,p28:1,p29:2,p30:6},output:{g1:0.5,g2:0.5,g3:0.5}},
    {input:{p1:2,p2:1,p3:15,p4:2,p5:3,p6:1,p7:3,p8:3,p9:4,p10:5,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:4,p27:2,p28:3,p29:5,p30:4},output:{g1:0.5,g2:0.5,g3:0.55}},
    {input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:2,p8:3,p9:4,p10:3,p11:3,p12:1,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:5,p26:2,p27:1,p28:2,p29:5,p30:0},output:{g1:0.8,g2:0.85,g3:0.85}},
    {input:{p1:2,p2:1,p3:15,p4:2,p5:3,p6:1,p7:2,p8:1,p9:4,p10:5,p11:1,p12:1,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:0,p22:0,p23:0,p24:1,p25:3,p26:4,p27:1,p28:1,p29:1,p30:0},output:{g1:0.3,g2:0.4,g3:0.45}},
    {input:{p1:2,p2:2,p3:16,p4:2,p5:3,p6:2,p7:4,p8:4,p9:4,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:5,p25:3,p26:2,p27:1,p28:3,p29:2,p30:5},output:{g1:0.5,g2:0.55,g3:0.55}},
    {input:{p1:2,p2:2,p3:16,p4:1,p5:3,p6:2,p7:1,p8:2,p9:5,p10:5,p11:5,p12:1,p13:1,p14:3,p15:0,p16:1,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:3,p27:1,p28:1,p29:5,p30:0},output:{g1:0.5,g2:0.55,g3:0.55}},
    {input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:1,p7:3,p8:2,p9:4,p10:5,p11:3,p12:2,p13:1,p14:2,p15:1,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:1,p24:4,p25:5,p26:4,p27:1,p28:2,p29:5,p30:0},output:{g1:0.5,g2:0.5,g3:0.5}},
    {input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:5,p12:2,p13:1,p14:1,p15:1,p16:0,p17:1,p18:0,p19:0,p20:0,p21:0,p22:1,p23:0,p24:5,p25:4,p26:4,p27:2,p28:2,p29:5,p30:0},output:{g1:0.3,g2:0.3,g3:0.35}},
    {input:{p1:2,p2:1,p3:15,p4:2,p5:3,p6:1,p7:4,p8:4,p9:1,p10:5,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:1,p25:5,p26:1,p27:3,p28:5,p29:5,p30:0},output:{g1:0.65,g2:0.7,g3:0.7}},
    {input:{p1:2,p2:1,p3:16,p4:1,p5:3,p6:2,p7:2,p8:2,p9:4,p10:5,p11:2,p12:1,p13:2,p14:4,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:0,p22:0,p23:1,p24:1,p25:2,p26:1,p27:1,p28:1,p29:1,p30:4},output:{g1:0.5,g2:0.45,g3:0.55}},
    {input:{p1:2,p2:1,p3:15,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:3,p11:2,p12:2,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:3,p27:1,p28:2,p29:4,p30:0},output:{g1:0.5,g2:0.5,g3:0.5}},
    {input:{p1:2,p2:1,p3:15,p4:2,p5:3,p6:1,p7:1,p8:1,p9:5,p10:3,p11:3,p12:1,p13:2,p14:1,p15:1,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:4,p26:3,p27:1,p28:2,p29:2,p30:4},output:{g1:0.3,g2:0.35,g3:0.4}},
    {input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:0,p8:2,p9:5,p10:5,p11:5,p12:1,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:3,p25:2,p26:3,p27:1,p28:2,p29:2,p30:0},output:{g1:0.6,g2:0.55,g3:0.6}},
    {input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:1,p7:2,p8:3,p9:5,p10:5,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:5,p26:5,p27:1,p28:3,p29:3,p30:2},output:{g1:0.5,g2:0.55,g3:0.6}},
    {input:{p1:2,p2:1,p3:15,p4:2,p5:3,p6:1,p7:3,p8:3,p9:5,p10:3,p11:3,p12:2,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:4,p25:1,p26:3,p27:1,p28:1,p29:4,p30:0},output:{g1:0.7,g2:0.8,g3:0.8}},
    {input:{p1:2,p2:2,p3:16,p4:1,p5:3,p6:1,p7:1,p8:1,p9:4,p10:3,p11:1,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:1,p24:5,p25:4,p26:5,p27:4,p28:5,p29:3,p30:0},output:{g1:0.35,g2:0,g3:0}},
    {input:{p1:2,p2:2,p3:17,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:1,p19:0,p20:0,p21:1,p22:1,p23:0,p24:4,p25:4,p26:3,p27:2,p28:4,p29:5,p30:4},output:{g1:0.4,g2:0.45,g3:0.45}},
    {input:{p1:2,p2:2,p3:15,p4:2,p5:3,p6:1,p7:4,p8:1,p9:2,p10:3,p11:2,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:4,p27:1,p28:2,p29:2,p30:0},output:{g1:0.6,g2:0.65,g3:0.7}},
    {input:{p1:2,p2:2,p3:15,p4:2,p5:3,p6:1,p7:4,p8:1,p9:2,p10:3,p11:2,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:4,p27:1,p28:2,p29:2,p30:7},output:{g1:0.35,g2:0.45,g3:0.4}},
    {input:{p1:2,p2:2,p3:16,p4:2,p5:3,p6:1,p7:3,p8:4,p9:5,p10:2,p11:5,p12:1,p13:3,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:0,p21:1,p22:0,p23:0,p24:3,p25:4,p26:5,p27:1,p28:2,p29:5,p30:4},output:{g1:0.45,g2:0.5,g3:0.55}},
    {input:{p1:2,p2:2,p3:15,p4:2,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:3,p12:1,p13:4,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:1,p24:5,p25:4,p26:5,p27:2,p28:4,p29:4,p30:8},output:{g1:0.35,g2:0.45,g3:0.45}},
    {input:{p1:2,p2:2,p3:15,p4:1,p5:3,p6:1,p7:3,p8:3,p9:4,p10:4,p11:2,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:3,p27:1,p28:1,p29:5,p30:0},output:{g1:0.55,g2:0.55,g3:0.55}},
    {input:{p1:2,p2:2,p3:17,p4:2,p5:3,p6:1,p7:2,p8:1,p9:5,p10:5,p11:5,p12:1,p13:3,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:0,p22:0,p23:1,p24:5,p25:5,p26:5,p27:5,p28:5,p29:3,p30:8},output:{g1:0.4,g2:0.5,g3:0.45}},
    {input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:4,p8:4,p9:1,p10:1,p11:3,p12:1,p13:2,p14:3,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:2,p26:2,p27:1,p28:1,p29:4,p30:6},output:{g1:0.8,g2:0.8,g3:0.85}},
    {input:{p1:2,p2:1,p3:15,p4:2,p5:3,p6:1,p7:1,p8:2,p9:5,p10:3,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:5,p25:1,p26:2,p27:1,p28:1,p29:1,p30:3},output:{g1:0.55,g2:0.65,g3:0.65}},
    {input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:2,p8:3,p9:5,p10:3,p11:3,p12:1,p13:3,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:5,p26:4,p27:1,p28:2,p29:1,p30:2},output:{g1:0.75,g2:0.75,g3:0.75}},
    {input:{p1:2,p2:2,p3:16,p4:2,p5:3,p6:1,p7:1,p8:2,p9:5,p10:5,p11:3,p12:2,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:3,p27:1,p28:1,p29:5,p30:0},output:{g1:0.5,g2:0.55,g3:0.55}},
    {input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:3,p12:1,p13:3,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:5,p27:1,p28:1,p29:4,p30:4},output:{g1:0.45,g2:0.5,g3:0.55}},
    {input:{p1:2,p2:1,p3:16,p4:1,p5:3,p6:1,p7:1,p8:2,p9:5,p10:3,p11:3,p12:1,p13:1,p14:3,p15:1,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:1,p25:3,p26:2,p27:1,p28:2,p29:4,p30:0},output:{g1:0.5,g2:0.4,g3:0.4}},
    {input:{p1:2,p2:1,p3:16,p4:1,p5:3,p6:1,p7:1,p8:2,p9:5,p10:3,p11:3,p12:1,p13:1,p14:3,p15:1,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:1,p25:3,p26:2,p27:1,p28:2,p29:4,p30:3},output:{g1:0.45,g2:0.4,g3:0.4}},
    {input:{p1:2,p2:1,p3:15,p4:1,p5:3,p6:1,p7:2,p8:1,p9:4,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:1,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:4,p25:4,p26:2,p27:3,p28:3,p29:2,p30:0},output:{g1:0.45,g2:0.5,g3:0.45}},
    {input:{p1:2,p2:1,p3:16,p4:1,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:3,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:0,p23:1,p24:5,p25:4,p26:3,p27:2,p28:1,p29:2,p30:0},output:{g1:0.65,g2:0.7,g3:0.75}},
    {input:{p1:2,p2:2,p3:17,p4:2,p5:3,p6:1,p7:1,p8:2,p9:4,p10:3,p11:2,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:5,p26:5,p27:5,p28:5,p29:3,p30:4},output:{g1:0.5,g2:0.55,g3:0.55}},
    {input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:1,p12:2,p13:4,p14:4,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:4,p25:3,p26:2,p27:1,p28:1,p29:1,p30:0},output:{g1:0.65,g2:0.5,g3:0.65}},
    {input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:5,p12:2,p13:4,p14:3,p15:0,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:4,p26:3,p27:1,p28:1,p29:5,p30:2},output:{g1:0.5,g2:0.45,g3:0.5}},
    {input:{p1:2,p2:1,p3:15,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:1,p12:2,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:1,p29:2,p30:1},output:{g1:0.55,g2:0.5,g3:0.55}},
    {input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:5,p12:1,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:2,p26:2,p27:4,p28:3,p29:2,p30:0},output:{g1:0.65,g2:0.6,g3:0.7}},
    {input:{p1:2,p2:1,p3:15,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:4,p11:3,p12:2,p13:3,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:2,p26:1,p27:1,p28:2,p29:2,p30:0},output:{g1:0.65,g2:0.7,g3:0.7}},
    {input:{p1:2,p2:1,p3:15,p4:2,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:5,p12:2,p13:1,p14:3,p15:0,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:4,p26:3,p27:2,p28:2,p29:5,p30:2},output:{g1:0.7,g2:0.55,g3:0.6}},
    {input:{p1:2,p2:2,p3:16,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:5,p12:2,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:3,p25:4,p26:4,p27:3,p28:4,p29:5,p30:6},output:{g1:0.55,g2:0.55,g3:0.55}},
    {input:{p1:2,p2:1,p3:18,p4:1,p5:3,p6:1,p7:1,p8:2,p9:5,p10:5,p11:3,p12:2,p13:1,p14:2,p15:1,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:3,p25:4,p26:4,p27:2,p28:3,p29:5,p30:9},output:{g1:0.45,g2:0.4,g3:0.4}},
    {input:{p1:2,p2:2,p3:15,p4:1,p5:3,p6:1,p7:3,p8:1,p9:5,p10:3,p11:1,p12:1,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:3,p25:2,p26:3,p27:1,p28:3,p29:4,p30:0},output:{g1:0.5,g2:0.45,g3:0.55}},
    {input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:2,p8:2,p9:5,p10:3,p11:3,p12:2,p13:3,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:4,p27:1,p28:1,p29:2,p30:1},output:{g1:0.7,g2:0.65,g3:0.7}},
    {input:{p1:2,p2:2,p3:15,p4:1,p5:3,p6:1,p7:2,p8:2,p9:2,p10:5,p11:2,p12:1,p13:3,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:3,p27:1,p28:2,p29:4,p30:1},output:{g1:0.65,g2:0.6,g3:0.65}},
    {input:{p1:2,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:5,p10:1,p11:3,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:1,p24:4,p25:3,p26:1,p27:1,p28:1,p29:3,p30:0},output:{g1:0.65,g2:0.6,g3:0.65}},
    {input:{p1:2,p2:1,p3:15,p4:2,p5:3,p6:1,p7:3,p8:3,p9:3,p10:5,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:5,p26:4,p27:1,p28:1,p29:1,p30:4},output:{g1:0.65,g2:0.6,g3:0.6}},
    {input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:2,p8:2,p9:4,p10:5,p11:3,p12:1,p13:2,p14:2,p15:1,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:0,p23:0,p24:4,p25:4,p26:4,p27:2,p28:3,p29:5,p30:2},output:{g1:0.6,g2:0.55,g3:0.6}},
    {input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:1,p12:2,p13:3,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:1,p24:4,p25:3,p26:2,p27:1,p28:1,p29:4,p30:0},output:{g1:0.7,g2:0.7,g3:0.8}},
    {input:{p1:2,p2:2,p3:16,p4:1,p5:3,p6:1,p7:2,p8:1,p9:4,p10:3,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:2,p25:4,p26:3,p27:2,p28:3,p29:4,p30:4},output:{g1:0.5,g2:0.4,g3:0.5}},
    {input:{p1:2,p2:2,p3:15,p4:2,p5:3,p6:1,p7:1,p8:3,p9:4,p10:5,p11:2,p12:2,p13:3,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:4,p27:3,p28:5,p29:3,p30:2},output:{g1:0.5,g2:0.55,g3:0.55}},
    {input:{p1:2,p2:1,p3:15,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:3,p11:3,p12:1,p13:2,p14:3,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:5,p25:3,p26:2,p27:1,p28:1,p29:4,p30:0},output:{g1:0.6,g2:0.65,g3:0.7}},
    {input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:2,p8:1,p9:5,p10:5,p11:1,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:5,p25:4,p26:3,p27:1,p28:1,p29:5,p30:2},output:{g1:0.5,g2:0.4,g3:0.4}},
    {input:{p1:2,p2:2,p3:15,p4:1,p5:3,p6:1,p7:3,p8:3,p9:3,p10:3,p11:3,p12:2,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:2,p28:4,p29:3,p30:11},output:{g1:0.6,g2:0.5,g3:0.55}},
    {input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:3,p12:2,p13:2,p14:2,p15:3,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:3,p25:4,p26:3,p27:1,p28:1,p29:1,p30:0},output:{g1:0.35,g2:0.35,g3:0.4}},
    {input:{p1:2,p2:1,p3:17,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:4,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:0,p22:0,p23:0,p24:4,p25:5,p26:3,p27:1,p28:1,p29:5,p30:4},output:{g1:0.45,g2:0.45,g3:0.5}},
    {input:{p1:2,p2:1,p3:19,p4:1,p5:3,p6:1,p7:2,p8:3,p9:4,p10:3,p11:3,p12:5,p13:1,p14:1,p15:1,p16:0,p17:0,p18:0,p19:0,p20:1,p21:0,p22:1,p23:1,p24:4,p25:4,p26:4,p27:1,p28:1,p29:2,p30:0},output:{g1:0.45,g2:0.45,g3:0.5}},
    {input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:1,p7:2,p8:1,p9:4,p10:5,p11:3,p12:1,p13:3,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:0,p22:0,p23:1,p24:5,p25:5,p26:3,p27:1,p28:1,p29:3,p30:2},output:{g1:0.45,g2:0.5,g3:0.55}},
    {input:{p1:2,p2:1,p3:15,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:0,p22:0,p23:1,p24:5,p25:2,p26:1,p27:1,p28:3,p29:4,p30:0},output:{g1:0.45,g2:0.5,g3:0.45}},
    {input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:3,p12:2,p13:3,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:0,p22:1,p23:0,p24:3,p25:4,p26:5,p27:1,p28:2,p29:1,p30:1},output:{g1:0.45,g2:0.5,g3:0.55}},
    {input:{p1:2,p2:1,p3:16,p4:1,p5:3,p6:2,p7:2,p8:2,p9:5,p10:5,p11:1,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:0,p22:0,p23:0,p24:4,p25:3,p26:4,p27:1,p28:2,p29:1,p30:6},output:{g1:0.35,g2:0.35,g3:0.4}},
    {input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:1,p7:2,p8:2,p9:4,p10:5,p11:3,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:5,p27:1,p28:2,p29:4,p30:0},output:{g1:0.55,g2:0.5,g3:0.55}},
    {input:{p1:2,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:3,p11:3,p12:2,p13:1,p14:1,p15:1,p16:0,p17:1,p18:1,p19:1,p20:0,p21:1,p22:1,p23:0,p24:4,p25:4,p26:3,p27:1,p28:4,p29:3,p30:1},output:{g1:0.45,g2:0.5,g3:0.5}},
    {input:{p1:2,p2:1,p3:18,p4:2,p5:3,p6:2,p7:3,p8:2,p9:5,p10:5,p11:3,p12:5,p13:2,p14:3,p15:2,p16:0,p17:1,p18:0,p19:0,p20:0,p21:0,p22:0,p23:1,p24:3,p25:3,p26:2,p27:1,p28:1,p29:2,p30:6},output:{g1:0.35,g2:0.45,g3:0.5}},
    {input:{p1:2,p2:1,p3:19,p4:1,p5:3,p6:1,p7:1,p8:1,p9:4,p10:3,p11:3,p12:1,p13:1,p14:3,p15:1,p16:0,p17:0,p18:0,p19:1,p20:1,p21:0,p22:0,p23:1,p24:5,p25:3,p26:1,p27:1,p28:1,p29:3,p30:6},output:{g1:0.35,g2:0.45,g3:0.45}},
    {input:{p1:2,p2:2,p3:18,p4:2,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:1,p12:1,p13:2,p14:1,p15:1,p16:0,p17:0,p18:0,p19:1,p20:1,p21:0,p22:1,p23:0,p24:4,p25:4,p26:3,p27:3,p28:4,p29:4,p30:0},output:{g1:0.4,g2:0.45,g3:0.5}},
    {input:{p1:2,p2:1,p3:18,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:4,p11:3,p12:1,p13:2,p14:1,p15:1,p16:0,p17:0,p18:0,p19:0,p20:0,p21:0,p22:1,p23:1,p24:3,p25:2,p26:3,p27:1,p28:1,p29:2,p30:4},output:{g1:0.45,g2:0.55,g3:0.5}},
    {input:{p1:2,p2:1,p3:19,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:3,p12:5,p13:2,p14:2,p15:1,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:1,p25:1,p26:4,p27:4,p28:1,p29:1,p30:12},output:{g1:0.35,g2:0.4,g3:0.45}},
    {input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:2,p7:2,p8:2,p9:2,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:0,p21:1,p22:0,p23:1,p24:3,p25:3,p26:2,p27:1,p28:1,p29:3,p30:2},output:{g1:0.4,g2:0.5,g3:0.5}},
    {input:{p1:2,p2:1,p3:17,p4:1,p5:3,p6:1,p7:0,p8:1,p9:5,p10:4,p11:3,p12:2,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:0,p23:0,p24:2,p25:4,p26:4,p27:3,p28:5,p29:5,p30:5},output:{g1:0.45,g2:0.45,g3:0.5}},
    {input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:1,p8:2,p9:4,p10:5,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:0,p22:1,p23:0,p24:4,p25:4,p26:5,p27:1,p28:3,p29:3,p30:0},output:{g1:0.4,g2:0.45,g3:0.45}},
    {input:{p1:2,p2:1,p3:16,p4:1,p5:3,p6:1,p7:3,p8:3,p9:5,p10:5,p11:2,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:0,p22:1,p23:1,p24:4,p25:5,p26:4,p27:1,p28:1,p29:4,p30:0},output:{g1:0.7,g2:0.65,g3:0.65}},
    {input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:1,p8:1,p9:3,p10:3,p11:1,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:4,p26:4,p27:2,p28:2,p29:4,p30:2},output:{g1:0.7,g2:0.7,g3:0.7}},
    {input:{p1:2,p2:2,p3:17,p4:1,p5:3,p6:1,p7:3,p8:3,p9:3,p10:4,p11:3,p12:1,p13:2,p14:4,p15:1,p16:0,p17:1,p18:1,p19:1,p20:1,p21:1,p22:0,p23:0,p24:5,p25:4,p26:5,p27:3,p28:4,p29:5,p30:0},output:{g1:0.5,g2:0.55,g3:0.5}},
    {input:{p1:2,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:1,p9:5,p10:3,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:3,p27:1,p28:1,p29:1,p30:0},output:{g1:0.7,g2:0.65,g3:0.7}},
    {input:{p1:2,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:5,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:1,p19:1,p20:1,p21:1,p22:0,p23:1,p24:4,p25:2,p26:5,p27:1,p28:2,p29:5,p30:0},output:{g1:0.85,g2:0.8,g3:0.8}},
    {input:{p1:2,p2:2,p3:17,p4:1,p5:3,p6:1,p7:1,p8:2,p9:5,p10:5,p11:3,p12:2,p13:1,p14:1,p15:1,p16:0,p17:1,p18:0,p19:1,p20:1,p21:0,p22:1,p23:1,p24:5,p25:3,p26:5,p27:5,p28:5,p29:1,p30:12},output:{g1:0.3,g2:0.35,g3:0.35}},
    {input:{p1:2,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:3,p9:5,p10:5,p11:3,p12:2,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:2,p26:5,p27:1,p28:5,p29:5,p30:8},output:{g1:0.7,g2:0.6,g3:0.65}},
    {input:{p1:2,p2:2,p3:17,p4:2,p5:3,p6:1,p7:2,p8:2,p9:3,p10:3,p11:5,p12:1,p13:3,p14:4,p15:1,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:1,p25:3,p26:5,p27:3,p28:5,p29:3,p30:2},output:{g1:0.5,g2:0.4,g3:0.45}},
    {input:{p1:2,p2:1,p3:16,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:3,p12:5,p13:1,p14:4,p15:0,p16:1,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:2,p25:2,p26:1,p27:1,p28:1,p29:5,p30:0},output:{g1:0.7,g2:0.7,g3:0.7}},
    {input:{p1:2,p2:1,p3:19,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:1,p12:1,p13:1,p14:3,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:5,p25:4,p26:5,p27:1,p28:1,p29:1,p30:0},output:{g1:0.6,g2:0.65,g3:0.65}},
    {input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:2,p12:1,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:1,p24:4,p25:4,p26:5,p27:1,p28:2,p29:5,p30:0},output:{g1:0.55,g2:0.55,g3:0.55}},
    {input:{p1:2,p2:1,p3:20,p4:1,p5:3,p6:1,p7:3,p8:3,p9:4,p10:3,p11:5,p12:1,p13:2,p14:2,p15:1,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:3,p25:3,p26:4,p27:2,p28:4,p29:3,p30:8},output:{g1:0.55,g2:0.45,g3:0.5}},
    {input:{p1:2,p2:1,p3:17,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:3,p11:3,p12:2,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:1,p24:4,p25:3,p26:3,p27:1,p28:1,p29:3,p30:0},output:{g1:0.55,g2:0.55,g3:0.5}},
    {input:{p1:2,p2:2,p3:17,p4:2,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:3,p12:1,p13:3,p14:1,p15:1,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:4,p25:4,p26:5,p27:1,p28:2,p29:5,p30:0},output:{g1:0.5,g2:0.45,g3:0.45}},
    {input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:3,p12:2,p13:3,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:5,p25:3,p26:2,p27:1,p28:1,p29:1,p30:0},output:{g1:0.8,g2:0.85,g3:0.9}},
    {input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:5,p25:3,p26:2,p27:1,p28:1,p29:1,p30:0},output:{g1:0.75,g2:0.85,g3:0.85}},
    {input:{p1:2,p2:1,p3:17,p4:1,p5:3,p6:2,p7:1,p8:0,p9:5,p10:5,p11:5,p12:1,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:4,p26:5,p27:1,p28:1,p29:4,p30:1},output:{g1:0.55,g2:0.45,g3:0.5}},
    {input:{p1:2,p2:1,p3:18,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:5,p12:1,p13:1,p14:2,p15:1,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:2,p27:1,p28:1,p29:5,p30:9},output:{g1:0.35,g2:0.35,g3:0.35}},
    {input:{p1:2,p2:1,p3:16,p4:1,p5:3,p6:1,p7:3,p8:1,p9:5,p10:5,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:3,p25:1,p26:3,p27:1,p28:3,p29:1,p30:0},output:{g1:0.4,g2:0.3,g3:0.4}},
    {input:{p1:2,p2:1,p3:16,p4:1,p5:3,p6:1,p7:3,p8:2,p9:3,p10:4,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:3,p25:1,p26:3,p27:1,p28:4,p29:3,p30:2},output:{g1:0.35,g2:0.3,g3:0.35}},
    {input:{p1:2,p2:1,p3:18,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:4,p11:2,p12:1,p13:2,p14:2,p15:0,p16:1,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:2,p25:3,p26:5,p27:1,p28:4,p29:3,p30:8},output:{g1:0.45,g2:0.4,g3:0.5}},
    {input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:4,p8:4,p9:2,p10:1,p11:2,p12:2,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:1,p23:1,p24:4,p25:3,p26:3,p27:2,p28:3,p29:2,p30:0},output:{g1:0.7,g2:0.8,g3:0.8}},
    {input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:1,p8:2,p9:5,p10:5,p11:2,p12:1,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:5,p27:1,p28:4,p29:2,p30:0},output:{g1:0.7,g2:0.7,g3:0.75}},
    {input:{p1:2,p2:1,p3:18,p4:1,p5:3,p6:2,p7:2,p8:4,p9:5,p10:3,p11:2,p12:2,p13:1,p14:2,p15:1,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:2,p25:3,p26:2,p27:1,p28:3,p29:1,p30:8},output:{g1:0.4,g2:0.25,g3:0.4}},
    {input:{p1:2,p2:2,p3:16,p4:2,p5:3,p6:1,p7:2,p8:1,p9:5,p10:3,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:2,p26:1,p27:1,p28:1,p29:2,p30:0},output:{g1:0.4,g2:0.35,g3:0}},
    {input:{p1:2,p2:1,p3:16,p4:1,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:5,p12:1,p13:3,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:2,p27:1,p28:3,p29:5,p30:6},output:{g1:0.3,g2:0.4,g3:0.4}},
    {input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:2,p8:3,p9:4,p10:3,p11:5,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:3,p25:3,p26:3,p27:1,p28:1,p29:2,p30:0},output:{g1:0.4,g2:0.5,g3:0.5}},
    {input:{p1:2,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:2,p10:2,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:4,p27:1,p28:2,p29:3,p30:4},output:{g1:0.4,g2:0.4,g3:0.4}},
    {input:{p1:2,p2:2,p3:18,p4:1,p5:3,p6:1,p7:4,p8:4,p9:4,p10:2,p11:1,p12:1,p13:1,p14:4,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:0,p22:1,p23:1,p24:5,p25:5,p26:5,p27:5,p28:5,p29:5,p30:2},output:{g1:0.25,g2:0.3,g3:0.3}},
    {input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:3,p8:4,p9:4,p10:5,p11:5,p12:1,p13:3,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:0,p23:0,p24:4,p25:2,p26:1,p27:1,p28:1,p29:2,p30:2},output:{g1:0.35,g2:0.45,g3:0.4}},
    {input:{p1:2,p2:2,p3:17,p4:1,p5:3,p6:1,p7:4,p8:4,p9:5,p10:3,p11:1,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:3,p27:1,p28:2,p29:5,p30:0},output:{g1:0.75,g2:0.7,g3:0.8}},
    {input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:1,p7:4,p8:1,p9:5,p10:5,p11:5,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:2,p26:3,p27:1,p28:2,p29:5,p30:1},output:{g1:0.65,g2:0.7,g3:0.7}},
    {input:{p1:2,p2:2,p3:16,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:3,p11:5,p12:1,p13:4,p14:3,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:5,p25:1,p26:3,p27:2,p28:2,p29:3,p30:0},output:{g1:0.5,g2:0.45,g3:0.5}},
    {input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:1,p7:2,p8:2,p9:4,p10:5,p11:5,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:1,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:1,p26:3,p27:1,p28:2,p29:5,p30:5},output:{g1:0.45,g2:0.45,g3:0.45}},
    {input:{p1:2,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:3,p11:5,p12:2,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:5,p25:1,p26:3,p27:1,p28:2,p29:5,p30:1},output:{g1:0.55,g2:0.55,g3:0.55}},
    {input:{p1:2,p2:2,p3:17,p4:1,p5:3,p6:1,p7:3,p8:3,p9:3,p10:3,p11:1,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:1,p26:4,p27:5,p28:5,p29:3,p30:8},output:{g1:0.35,g2:0.5,g3:0.45}},
    {input:{p1:2,p2:2,p3:17,p4:1,p5:3,p6:1,p7:1,p8:1,p9:4,p10:3,p11:5,p12:1,p13:3,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:5,p25:1,p26:3,p27:3,p28:3,p29:1,p30:0},output:{g1:0.5,g2:0.5,g3:0.5}},
    {input:{p1:2,p2:2,p3:16,p4:1,p5:3,p6:1,p7:2,p8:1,p9:2,p10:3,p11:5,p12:1,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:0,p21:1,p22:1,p23:1,p24:4,p25:2,p26:2,p27:1,p28:4,p29:5,p30:2},output:{g1:0.45,g2:0.35,g3:0.4}},
    {input:{p1:2,p2:1,p3:16,p4:1,p5:3,p6:1,p7:2,p8:1,p9:5,p10:3,p11:5,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:3,p25:2,p26:2,p27:1,p28:1,p29:3,p30:0},output:{g1:0.7,g2:0.75,g3:0.8}},
    {input:{p1:2,p2:2,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:2,p11:5,p12:2,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:1,p26:2,p27:2,p28:5,p29:5,p30:0},output:{g1:0.55,g2:0.6,g3:0.6}},
    {input:{p1:2,p2:2,p3:15,p4:2,p5:3,p6:1,p7:1,p8:2,p9:5,p10:3,p11:3,p12:1,p13:3,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:5,p25:5,p26:5,p27:1,p28:3,p29:5,p30:11},output:{g1:0.45,g2:0.55,g3:0.5}},
    {input:{p1:2,p2:2,p3:15,p4:1,p5:3,p6:2,p7:2,p8:2,p9:5,p10:5,p11:2,p12:1,p13:3,p14:4,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:5,p25:4,p26:5,p27:2,p28:3,p29:5,p30:8},output:{g1:0.65,g2:0.7,g3:0.7}},
    {input:{p1:2,p2:2,p3:15,p4:1,p5:3,p6:2,p7:2,p8:1,p9:3,p10:3,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:2,p29:5,p30:11},output:{g1:0.6,g2:0.65,g3:0.6}},
    {input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:3,p12:1,p13:1,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:0,p23:1,p24:4,p25:3,p26:3,p27:2,p28:2,p29:5,p30:2},output:{g1:0.55,g2:0.55,g3:0.55}},
    {input:{p1:2,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:1,p9:5,p10:5,p11:1,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:1,p25:2,p26:4,p27:2,p28:2,p29:1,p30:8},output:{g1:0.45,g2:0.5,g3:0.5}},
    {input:{p1:2,p2:1,p3:17,p4:1,p5:3,p6:1,p7:3,p8:2,p9:4,p10:5,p11:1,p12:1,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:1,p24:4,p25:3,p26:3,p27:2,p28:2,p29:1,p30:5},output:{g1:0.45,g2:0.55,g3:0.55}},
    {input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:5,p12:1,p13:2,p14:2,p15:0,p16:1,p17:0,p18:1,p19:0,p20:1,p21:1,p22:0,p23:0,p24:5,p25:1,p26:3,p27:1,p28:1,p29:5,p30:0},output:{g1:0.55,g2:0.45,g3:0.55}},
    {input:{p1:2,p2:1,p3:16,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:3,p11:3,p12:1,p13:2,p14:3,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:5,p25:3,p26:5,p27:1,p28:4,p29:5,p30:1},output:{g1:0.5,g2:0.55,g3:0.6}},
    {input:{p1:2,p2:2,p3:17,p4:2,p5:3,p6:1,p7:4,p8:4,p9:2,p10:5,p11:3,p12:2,p13:3,p14:1,p15:3,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:3,p25:3,p26:3,p27:1,p28:3,p29:5,p30:2},output:{g1:0.45,g2:0.45,g3:0.4}},
    {input:{p1:2,p2:2,p3:17,p4:2,p5:3,p6:1,p7:1,p8:3,p9:5,p10:5,p11:3,p12:2,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:0,p23:1,p24:5,p25:1,p26:2,p27:3,p28:3,p29:5,p30:2},output:{g1:0.6,g2:0.55,g3:0.6}},
    {input:{p1:2,p2:2,p3:17,p4:1,p5:3,p6:1,p7:3,p8:4,p9:3,p10:5,p11:5,p12:1,p13:1,p14:2,p15:1,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:1,p24:5,p25:4,p26:4,p27:3,p28:4,p29:5,p30:8},output:{g1:0.4,g2:0.45,g3:0.4}},
    {input:{p1:2,p2:1,p3:17,p4:1,p5:3,p6:1,p7:4,p8:4,p9:2,p10:2,p11:3,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:2,p26:5,p27:1,p28:1,p29:5,p30:0},output:{g1:0.65,g2:0.75,g3:0.8}},
    {input:{p1:2,p2:2,p3:16,p4:2,p5:3,p6:1,p7:4,p8:1,p9:5,p10:4,p11:5,p12:2,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:1,p26:2,p27:2,p28:1,p29:2,p30:0},output:{g1:0.5,g2:0.55,g3:0.55}},
    {input:{p1:2,p2:1,p3:17,p4:1,p5:3,p6:2,p7:1,p8:1,p9:4,p10:4,p11:5,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:5,p26:5,p27:1,p28:2,p29:3,p30:2},output:{g1:0.55,g2:0.5,g3:0.55}},
    {input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:1,p7:4,p8:2,p9:5,p10:5,p11:3,p12:1,p13:2,p14:2,p15:0,p16:1,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:2,p28:3,p29:5,p30:0},output:{g1:0.85,g2:0.9,g3:0.9}},
    {input:{p1:2,p2:2,p3:16,p4:1,p5:3,p6:2,p7:2,p8:2,p9:5,p10:3,p11:3,p12:2,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:1,p24:4,p25:1,p26:2,p27:2,p28:2,p29:5,p30:0},output:{g1:0.6,g2:0.65,g3:0.65}},
    {input:{p1:2,p2:2,p3:17,p4:1,p5:3,p6:1,p7:3,p8:2,p9:5,p10:5,p11:5,p12:2,p13:2,p14:2,p15:0,p16:0,p17:1,p18:1,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:1,p26:2,p27:2,p28:2,p29:1,p30:0},output:{g1:0.65,g2:0.7,g3:0.65}},
    {input:{p1:2,p2:2,p3:19,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:5,p12:1,p13:1,p14:2,p15:2,p16:0,p17:1,p18:0,p19:1,p20:1,p21:0,p22:1,p23:0,p24:4,p25:4,p26:3,p27:3,p28:4,p29:4,p30:2},output:{g1:0.45,g2:0.45,g3:0.5}},
    {input:{p1:2,p2:2,p3:17,p4:1,p5:3,p6:2,p7:1,p8:0,p9:5,p10:5,p11:1,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:1,p24:4,p25:1,p26:2,p27:1,p28:1,p29:5,p30:4},output:{g1:0.55,g2:0.55,g3:0.6}},
    {input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:4,p11:3,p12:2,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:0,p22:1,p23:1,p24:3,p25:5,p26:5,p27:2,p28:2,p29:4,p30:3},output:{g1:0.5,g2:0.55,g3:0.5}},
    {input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:1,p8:2,p9:5,p10:5,p11:1,p12:2,p13:1,p14:3,p15:0,p16:1,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:1,p24:4,p25:3,p26:4,p27:1,p28:1,p29:3,p30:5},output:{g1:0.65,g2:0.7,g3:0.65}},
    {input:{p1:2,p2:2,p3:16,p4:2,p5:3,p6:1,p7:1,p8:2,p9:5,p10:4,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:4,p26:4,p27:2,p28:4,p29:5,p30:4},output:{g1:0.45,g2:0.5,g3:0.55}},
    {input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:1,p7:3,p8:1,p9:5,p10:5,p11:3,p12:1,p13:2,p14:2,p15:3,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:1,p24:5,p25:4,p26:4,p27:1,p28:1,p29:5,p30:2},output:{g1:0.35,g2:0.45,g3:0.5}},
    {input:{p1:2,p2:2,p3:17,p4:2,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:0,p22:0,p23:1,p24:5,p25:5,p26:5,p27:3,p28:5,p29:5,p30:0},output:{g1:0.4,g2:0.65,g3:0.5}},
    {input:{p1:2,p2:2,p3:18,p4:2,p5:3,p6:1,p7:1,p8:0,p9:4,p10:4,p11:3,p12:5,p13:3,p14:1,p15:1,p16:1,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:2,p27:1,p28:1,p29:4,p30:0},output:{g1:0.6,g2:0.6,g3:0.65}},
    {input:{p1:2,p2:2,p3:17,p4:2,p5:3,p6:1,p7:1,p8:1,p9:5,p10:3,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:1,p24:4,p25:5,p26:5,p27:1,p28:3,p29:2,p30:0},output:{g1:0.5,g2:0.45,g3:0.5}},
    {input:{p1:2,p2:2,p3:18,p4:1,p5:3,p6:1,p7:1,p8:1,p9:4,p10:4,p11:3,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:3,p27:1,p28:4,p29:5,p30:6},output:{g1:0.5,g2:0.45,g3:0.5}},
    {input:{p1:2,p2:1,p3:16,p4:2,p5:3,p6:1,p7:2,p8:2,p9:5,p10:3,p11:3,p12:2,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:0,p23:1,p24:5,p25:4,p26:3,p27:1,p28:1,p29:1,p30:0},output:{g1:0.55,g2:0.65,g3:0.6}},
    {input:{p1:2,p2:2,p3:17,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:3,p12:1,p13:1,p14:1,p15:1,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:0,p23:1,p24:1,p25:2,p26:1,p27:2,p28:3,p29:5,p30:0},output:{g1:0.35,g2:0,g3:0}},
    {input:{p1:2,p2:2,p3:16,p4:2,p5:3,p6:1,p7:3,p8:2,p9:3,p10:5,p11:3,p12:2,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:5,p26:5,p27:2,p28:3,p29:5,p30:2},output:{g1:0.55,g2:0.45,g3:0.5}},
    {input:{p1:2,p2:2,p3:16,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:5,p26:5,p27:2,p28:4,p29:5,p30:0},output:{g1:0.5,g2:0.5,g3:0.45}},
    {input:{p1:2,p2:2,p3:18,p4:2,p5:3,p6:1,p7:1,p8:1,p9:3,p10:5,p11:3,p12:5,p13:2,p14:1,p15:1,p16:0,p17:1,p18:0,p19:0,p20:1,p21:0,p22:1,p23:1,p24:5,p25:3,p26:3,p27:2,p28:3,p29:5,p30:2},output:{g1:0.45,g2:0.35,g3:0.45}},
    {input:{p1:2,p2:2,p3:18,p4:2,p5:3,p6:1,p7:3,p8:2,p9:3,p10:5,p11:3,p12:1,p13:1,p14:1,p15:1,p16:0,p17:0,p18:0,p19:0,p20:1,p21:0,p22:1,p23:0,p24:2,p25:3,p26:1,p27:2,p28:2,p29:5,p30:0},output:{g1:0.2,g2:0,g3:0}},
    {input:{p1:2,p2:2,p3:19,p4:1,p5:3,p6:1,p7:3,p8:2,p9:4,p10:3,p11:3,p12:1,p13:2,p14:1,p15:3,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:3,p25:2,p26:1,p27:1,p28:1,p29:3,p30:4},output:{g1:0.3,g2:0.55,g3:0.45}},
    {input:{p1:2,p2:2,p3:18,p4:1,p5:3,p6:1,p7:3,p8:3,p9:4,p10:4,p11:3,p12:1,p13:1,p14:2,p15:2,p16:0,p17:1,p18:0,p19:1,p20:1,p21:0,p22:1,p23:0,p24:4,p25:4,p26:5,p27:1,p28:3,p29:3,p30:9},output:{g1:0.2,g2:0.4,g3:0.4}},
    {input:{p1:2,p2:2,p3:16,p4:2,p5:3,p6:1,p7:2,p8:2,p9:3,p10:3,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:5,p25:4,p26:3,p27:2,p28:4,p29:4,p30:6},output:{g1:0.35,g2:0.4,g3:0.4}},
    {input:{p1:2,p2:2,p3:19,p4:1,p5:3,p6:1,p7:2,p8:1,p9:4,p10:5,p11:3,p12:5,p13:2,p14:1,p15:3,p16:0,p17:0,p18:0,p19:1,p20:0,p21:0,p22:1,p23:1,p24:4,p25:4,p26:3,p27:1,p28:3,p29:5,p30:4},output:{g1:0.4,g2:0.45,g3:0.45}},
    {input:{p1:2,p2:1,p3:16,p4:1,p5:3,p6:2,p7:3,p8:2,p9:3,p10:4,p11:3,p12:1,p13:2,p14:2,p15:2,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:1,p24:2,p25:5,p26:5,p27:1,p28:1,p29:1,p30:8},output:{g1:0.25,g2:0.25,g3:0.35}},
    {input:{p1:2,p2:1,p3:17,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:4,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:2,p27:1,p28:2,p29:5,p30:9},output:{g1:0.35,g2:0.45,g3:0.5}},
    {input:{p1:2,p2:2,p3:20,p4:2,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:3,p12:5,p13:2,p14:1,p15:1,p16:0,p17:1,p18:0,p19:0,p20:1,p21:0,p22:1,p23:1,p24:4,p25:4,p26:3,p27:2,p28:4,p29:4,p30:12},output:{g1:0.4,g2:0.55,g3:0.5}},
    {input:{p1:2,p2:1,p3:18,p4:2,p5:3,p6:2,p7:4,p8:3,p9:3,p10:3,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:4,p27:3,p28:4,p29:2,p30:8},output:{g1:0.5,g2:0.55,g3:0.5}},
    {input:{p1:2,p2:2,p3:18,p4:2,p5:3,p6:1,p7:3,p8:2,p9:5,p10:5,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:2,p25:5,p26:5,p27:5,p28:5,p29:5,p30:8},output:{g1:0.45,g2:0.5,g3:0.55}},
    {input:{p1:2,p2:2,p3:19,p4:2,p5:3,p6:1,p7:1,p8:1,p9:5,p10:3,p11:1,p12:5,p13:3,p14:2,p15:1,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:4,p27:3,p28:3,p29:2,p30:8},output:{g1:0.5,g2:0.45,g3:0.55}},
    {input:{p1:2,p2:2,p3:17,p4:1,p5:3,p6:1,p7:3,p8:3,p9:2,p10:5,p11:3,p12:1,p13:2,p14:2,p15:1,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:5,p26:4,p27:2,p28:3,p29:3,p30:4},output:{g1:0.4,g2:0.45,g3:0.5}},
    {input:{p1:2,p2:2,p3:18,p4:1,p5:3,p6:1,p7:1,p8:3,p9:4,p10:3,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:0,p22:1,p23:1,p24:4,p25:3,p26:3,p27:2,p28:3,p29:3,p30:0},output:{g1:0.45,g2:0.5,g3:0.45}},
    {input:{p1:2,p2:2,p3:19,p4:2,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:1,p12:5,p13:3,p14:1,p15:1,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:4,p27:3,p28:3,p29:5,p30:4},output:{g1:0.4,g2:0.45,g3:0.5}},
    {input:{p1:2,p2:1,p3:18,p4:1,p5:3,p6:2,p7:1,p8:2,p9:4,p10:5,p11:3,p12:1,p13:2,p14:2,p15:2,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:3,p27:1,p28:1,p29:5,p30:2},output:{g1:0.3,g2:0.4,g3:0.4}},
    {input:{p1:2,p2:1,p3:19,p4:1,p5:3,p6:2,p7:1,p8:1,p9:4,p10:5,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:0,p22:0,p23:0,p24:1,p25:4,p26:4,p27:1,p28:1,p29:5,p30:0},output:{g1:0.3,g2:0.4,g3:0.35}},
    {input:{p1:2,p2:1,p3:18,p4:2,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:5,p12:1,p13:2,p14:1,p15:1,p16:0,p17:0,p18:0,p19:0,p20:1,p21:0,p22:1,p23:1,p24:5,p25:5,p26:5,p27:1,p28:1,p29:3,p30:0},output:{g1:0.4,g2:0.3,g3:0}},
    {input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:1,p7:0,p8:0,p9:4,p10:5,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:3,p27:1,p28:1,p29:5,p30:0},output:{g1:0.5,g2:0.55,g3:0.55}},
    {input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:2,p7:3,p8:1,p9:5,p10:4,p11:3,p12:5,p13:2,p14:3,p15:0,p16:0,p17:1,p18:1,p19:0,p20:1,p21:0,p22:0,p23:0,p24:4,p25:2,p26:3,p27:2,p28:2,p29:3,p30:5},output:{g1:0.4,g2:0.35,g3:0.4}},
    {input:{p1:2,p2:1,p3:17,p4:1,p5:3,p6:1,p7:4,p8:2,p9:1,p10:3,p11:1,p12:1,p13:1,p14:2,p15:0,p16:1,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:5,p26:5,p27:1,p28:3,p29:5,p30:0},output:{g1:0.4,g2:0.4,g3:0}},
    {input:{p1:2,p2:1,p3:18,p4:2,p5:3,p6:1,p7:2,p8:2,p9:3,p10:3,p11:3,p12:1,p13:1,p14:2,p15:1,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:2,p25:3,p26:3,p27:1,p28:2,p29:4,p30:3},output:{g1:0.35,g2:0.3,g3:0.4}},
    {input:{p1:2,p2:1,p3:17,p4:1,p5:3,p6:1,p7:4,p8:1,p9:2,p10:4,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:1,p24:3,p25:2,p26:2,p27:1,p28:1,p29:5,p30:0},output:{g1:0.4,g2:0.5,g3:0.45}},
    {input:{p1:2,p2:1,p3:17,p4:1,p5:3,p6:1,p7:1,p8:2,p9:4,p10:5,p11:3,p12:2,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:5,p26:1,p27:1,p28:1,p29:3,p30:0},output:{g1:0.35,g2:0.5,g3:0.5}},
    {input:{p1:2,p2:1,p3:18,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:3,p12:1,p13:3,p14:2,p15:2,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:0,p23:1,p24:3,p25:4,p26:4,p27:2,p28:2,p29:5,p30:3},output:{g1:0.35,g2:0.4,g3:0.35}},
    {input:{p1:2,p2:1,p3:18,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:4,p11:2,p12:2,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:4,p25:3,p26:5,p27:1,p28:1,p29:1,p30:2},output:{g1:0.6,g2:0.65,g3:0.7}},
    {input:{p1:2,p2:1,p3:17,p4:1,p5:3,p6:1,p7:3,p8:3,p9:3,p10:3,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:3,p27:1,p28:1,p29:4,p30:0},output:{g1:0.55,g2:0.6,g3:0.65}},
    {input:{p1:2,p2:1,p3:18,p4:1,p5:3,p6:2,p7:1,p8:2,p9:4,p10:5,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:3,p27:1,p28:2,p29:4,p30:0},output:{g1:0.6,g2:0.65,g3:0.7}},
    {input:{p1:2,p2:1,p3:18,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:1,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:4,p25:3,p26:5,p27:1,p28:2,p29:1,p30:0},output:{g1:0.9,g2:0.9,g3:0.9}},
    {input:{p1:2,p2:2,p3:18,p4:1,p5:3,p6:1,p7:4,p8:4,p9:3,p10:5,p11:2,p12:1,p13:1,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:5,p27:1,p28:1,p29:5,p30:3},output:{g1:0.85,g2:0.85,g3:0.85}},
    {input:{p1:2,p2:1,p3:17,p4:1,p5:3,p6:1,p7:4,p8:2,p9:5,p10:5,p11:3,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:2,p29:4,p30:0},output:{g1:0.85,g2:0.9,g3:0.9}},
    {input:{p1:2,p2:1,p3:18,p4:2,p5:3,p6:1,p7:2,p8:2,p9:4,p10:5,p11:3,p12:1,p13:3,p14:2,p15:1,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:0,p23:1,p24:4,p25:3,p26:3,p27:1,p28:1,p29:4,p30:0},output:{g1:0.45,g2:0,g3:0}},
    {input:{p1:2,p2:2,p3:18,p4:1,p5:3,p6:1,p7:1,p8:2,p9:4,p10:3,p11:1,p12:1,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:0,p23:0,p24:4,p25:1,p26:4,p27:5,p28:5,p29:1,p30:8},output:{g1:0.5,g2:0.55,g3:0.55}},
    {input:{p1:2,p2:2,p3:18,p4:2,p5:3,p6:1,p7:4,p8:4,p9:4,p10:3,p11:5,p12:1,p13:3,p14:1,p15:0,p16:0,p17:1,p18:1,p19:1,p20:1,p21:1,p22:1,p23:1,p24:2,p25:5,p26:5,p27:1,p28:1,p29:1,p30:5},output:{g1:0.6,g2:0.65,g3:0.7}},
    {input:{p1:2,p2:2,p3:17,p4:2,p5:3,p6:1,p7:1,p8:1,p9:5,p10:3,p11:5,p12:2,p13:3,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:0,p21:0,p22:0,p23:0,p24:4,p25:2,p26:3,p27:3,p28:4,p29:4,p30:4},output:{g1:0.6,g2:0.65,g3:0.7}},
    {input:{p1:2,p2:1,p3:18,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:5,p11:3,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:1,p24:1,p25:3,p26:1,p27:1,p28:1,p29:2,p30:4},output:{g1:0.4,g2:0.4,g3:0.5}},
    {input:{p1:2,p2:1,p3:18,p4:1,p5:3,p6:1,p7:2,p8:2,p9:3,p10:3,p11:3,p12:2,p13:2,p14:3,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:5,p25:4,p26:5,p27:1,p28:4,p29:3,p30:0},output:{g1:0.55,g2:0.6,g3:0.65}},
    {input:{p1:2,p2:1,p3:18,p4:2,p5:3,p6:2,p7:4,p8:2,p9:1,p10:5,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:5,p25:3,p26:1,p27:1,p28:1,p29:5,p30:0},output:{g1:0.25,g2:0,g3:0}},
    {input:{p1:2,p2:1,p3:18,p4:1,p5:3,p6:1,p7:1,p8:1,p9:4,p10:3,p11:3,p12:1,p13:3,p14:2,p15:1,p16:0,p17:0,p18:0,p19:0,p20:1,p21:0,p22:0,p23:0,p24:4,p25:4,p26:2,p27:1,p28:2,p29:2,p30:2},output:{g1:0.45,g2:0.5,g3:0.5}},
    {input:{p1:2,p2:1,p3:19,p4:1,p5:3,p6:1,p7:1,p8:1,p9:4,p10:3,p11:5,p12:2,p13:2,p14:1,p15:1,p16:0,p17:0,p18:0,p19:0,p20:1,p21:0,p22:0,p23:0,p24:5,p25:5,p26:5,p27:2,p28:3,p29:2,p30:0},output:{g1:0.25,g2:0,g3:0}},
    {input:{p1:2,p2:1,p3:17,p4:1,p5:3,p6:1,p7:4,p8:2,p9:1,p10:5,p11:3,p12:2,p13:2,p14:4,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:2,p26:3,p27:3,p28:1,p29:5,p30:0},output:{g1:0.9,g2:0.9,g3:0.9}},
    {input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:2,p7:2,p8:1,p9:3,p10:5,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:5,p25:3,p26:3,p27:1,p28:2,p29:2,p30:5},output:{g1:0.55,g2:0.55,g3:0.6}},
    {input:{p1:2,p2:1,p3:18,p4:1,p5:3,p6:2,p7:1,p8:1,p9:4,p10:3,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:1,p24:5,p25:2,p26:3,p27:1,p28:2,p29:3,p30:2},output:{g1:0.4,g2:0.5,g3:0.55}},
    {input:{p1:2,p2:1,p3:18,p4:1,p5:3,p6:1,p7:1,p8:2,p9:4,p10:4,p11:3,p12:2,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:0,p22:0,p23:0,p24:4,p25:1,p26:1,p27:1,p28:1,p29:4,p30:0},output:{g1:0.55,g2:0.55,g3:0.6}},
    {input:{p1:2,p2:1,p3:19,p4:2,p5:3,p6:2,p7:1,p8:1,p9:4,p10:4,p11:3,p12:5,p13:2,p14:2,p15:3,p16:0,p17:1,p18:0,p19:1,p20:1,p21:0,p22:0,p23:1,p24:3,p25:5,p26:4,p27:1,p28:4,p29:1,p30:0},output:{g1:0.4,g2:0,g3:0}},
    {input:{p1:2,p2:1,p3:18,p4:2,p5:3,p6:1,p7:2,p8:2,p9:3,p10:5,p11:1,p12:1,p13:2,p14:3,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:2,p26:1,p27:1,p28:1,p29:4,p30:5},output:{g1:0.7,g2:0.7,g3:0.75}},
    {input:{p1:2,p2:2,p3:17,p4:2,p5:3,p6:1,p7:4,p8:3,p9:3,p10:5,p11:1,p12:1,p13:2,p14:2,p15:1,p16:0,p17:1,p18:1,p19:1,p20:0,p21:1,p22:1,p23:1,p24:4,p25:5,p26:5,p27:1,p28:3,p29:2,p30:4},output:{g1:0.5,g2:0.55,g3:0.55}},
    {input:{p1:2,p2:1,p3:18,p4:1,p5:3,p6:1,p7:3,p8:3,p9:3,p10:3,p11:3,p12:2,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:0,p23:1,p24:5,p25:3,p26:4,p27:1,p28:1,p29:5,p30:0},output:{g1:0.5,g2:0.5,g3:0.5}},
    {input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:1,p7:4,p8:4,p9:1,p10:3,p11:5,p12:2,p13:2,p14:2,p15:0,p16:0,p17:1,p18:1,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:3,p27:1,p28:2,p29:5,p30:2},output:{g1:0.6,g2:0.6,g3:0.6}},
    {input:{p1:2,p2:1,p3:17,p4:1,p5:3,p6:2,p7:3,p8:2,p9:3,p10:5,p11:2,p12:1,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:1,p24:1,p25:2,p26:3,p27:1,p28:2,p29:5,p30:0},output:{g1:0.75,g2:0.7,g3:0.75}},
    {input:{p1:2,p2:2,p3:18,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:3,p11:1,p12:2,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:0,p21:1,p22:1,p23:1,p24:3,p25:3,p26:2,p27:1,p28:2,p29:3,p30:2},output:{g1:0.7,g2:0.65,g3:0.7}},
    {input:{p1:2,p2:1,p3:18,p4:1,p5:3,p6:1,p7:1,p8:1,p9:4,p10:3,p11:3,p12:2,p13:2,p14:3,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:3,p26:2,p27:1,p28:1,p29:4,p30:0},output:{g1:0.95,g2:0.85,g3:0.9}},
    {input:{p1:2,p2:1,p3:18,p4:2,p5:3,p6:2,p7:1,p8:2,p9:4,p10:5,p11:3,p12:1,p13:3,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:1,p24:4,p25:3,p26:4,p27:1,p28:4,p29:5,p30:0},output:{g1:0.8,g2:0.75,g3:0.75}},
    {input:{p1:2,p2:1,p3:18,p4:1,p5:3,p6:1,p7:3,p8:3,p9:3,p10:3,p11:5,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:2,p27:1,p28:3,p29:3,p30:6},output:{g1:0.65,g2:0.6,g3:0.65}},
    {input:{p1:2,p2:1,p3:17,p4:1,p5:3,p6:1,p7:4,p8:4,p9:4,p10:4,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:2,p25:3,p26:4,p27:1,p28:1,p29:1,p30:4},output:{g1:0.75,g2:0.7,g3:0.75}},
    {input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:1,p7:1,p8:2,p9:5,p10:3,p11:3,p12:2,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:0,p21:1,p22:0,p23:0,p24:3,p25:2,p26:2,p27:1,p28:2,p29:3,p30:0},output:{g1:0.65,g2:0.65,g3:0.65}},
    {input:{p1:2,p2:2,p3:18,p4:2,p5:3,p6:1,p7:1,p8:3,p9:4,p10:5,p11:3,p12:1,p13:2,p14:2,p15:0,p16:0,p17:1,p18:1,p19:0,p20:1,p21:1,p22:0,p23:0,p24:3,p25:3,p26:4,p27:2,p28:4,p29:3,p30:0},output:{g1:0.4,g2:0.5,g3:0.45}},
    {input:{p1:2,p2:2,p3:18,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:3,p11:5,p12:1,p13:2,p14:3,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:2,p26:2,p27:2,p28:2,p29:5,p30:0},output:{g1:0.75,g2:0.8,g3:0.8}},
    {input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:1,p7:1,p8:1,p9:5,p10:3,p11:2,p12:1,p13:3,p14:1,p15:1,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:5,p25:2,p26:1,p27:1,p28:2,p29:1,p30:0},output:{g1:0.4,g2:0.4,g3:0.45}},
    {input:{p1:2,p2:1,p3:18,p4:1,p5:3,p6:1,p7:2,p8:3,p9:4,p10:3,p11:3,p12:2,p13:2,p14:1,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:5,p25:2,p26:3,p27:1,p28:2,p29:4,p30:0},output:{g1:0.5,g2:0.5,g3:0.5}},
    {input:{p1:2,p2:1,p3:18,p4:2,p5:3,p6:1,p7:4,p8:4,p9:5,p10:1,p11:5,p12:2,p13:3,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:0,p21:1,p22:1,p23:1,p24:3,p25:2,p26:2,p27:4,p28:2,p29:5,p30:0},output:{g1:0.35,g2:0.25,g3:0}},
    {input:{p1:2,p2:2,p3:18,p4:2,p5:3,p6:1,p7:1,p8:2,p9:4,p10:3,p11:5,p12:2,p13:3,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:0,p22:1,p23:1,p24:4,p25:3,p26:3,p27:2,p28:3,p29:3,p30:3},output:{g1:0.45,g2:0.5,g3:0.5}},
    {input:{p1:2,p2:1,p3:17,p4:1,p5:3,p6:1,p7:2,p8:2,p9:5,p10:4,p11:1,p12:1,p13:1,p14:3,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:0,p23:1,p24:3,p25:4,p26:3,p27:1,p28:1,p29:3,p30:8},output:{g1:0.5,g2:0.55,g3:0.6}},
    {input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:1,p7:1,p8:2,p9:5,p10:5,p11:3,p12:1,p13:1,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:3,p25:5,p26:5,p27:1,p28:3,p29:1,p30:4},output:{g1:0.35,g2:0.4,g3:0.45}},
    {input:{p1:2,p2:1,p3:18,p4:2,p5:3,p6:1,p7:4,p8:4,p9:5,p10:5,p11:2,p12:1,p13:2,p14:3,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:4,p27:1,p28:1,p29:1,p30:0},output:{g1:0.75,g2:0.85,g3:0.85}},
    {input:{p1:2,p2:1,p3:18,p4:2,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:1,p12:1,p13:4,p14:3,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:2,p27:1,p28:2,p29:4,p30:4},output:{g1:0.5,g2:0.55,g3:0.6}},
    {input:{p1:2,p2:1,p3:19,p4:2,p5:3,p6:1,p7:1,p8:1,p9:4,p10:5,p11:3,p12:5,p13:2,p14:2,p15:1,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:3,p26:3,p27:1,p28:1,p29:3,p30:4},output:{g1:0.35,g2:0.4,g3:0.45}},
    {input:{p1:2,p2:1,p3:18,p4:2,p5:3,p6:1,p7:4,p8:4,p9:1,p10:3,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:5,p25:4,p26:3,p27:3,p28:4,p29:2,p30:1},output:{g1:0.65,g2:0.7,g3:0.7}},
    {input:{p1:2,p2:1,p3:18,p4:1,p5:3,p6:1,p7:3,p8:3,p9:5,p10:5,p11:1,p12:1,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:1,p24:4,p25:1,p26:3,p27:1,p28:2,p29:1,p30:1},output:{g1:0.8,g2:0.8,g3:0.8}},
    {input:{p1:2,p2:1,p3:17,p4:2,p5:3,p6:1,p7:3,p8:1,p9:4,p10:5,p11:2,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:4,p25:5,p26:4,p27:2,p28:3,p29:1,p30:10},output:{g1:0.4,g2:0.45,g3:0.45}},
    {input:{p1:2,p2:2,p3:18,p4:1,p5:3,p6:1,p7:4,p8:4,p9:1,p10:1,p11:1,p12:2,p13:1,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:3,p25:2,p26:4,p27:1,p28:4,p29:2,p30:4},output:{g1:0.85,g2:0.9,g3:0.95}},
    {input:{p1:2,p2:2,p3:18,p4:2,p5:3,p6:1,p7:2,p8:1,p9:5,p10:5,p11:5,p12:1,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:1,p23:1,p24:4,p25:4,p26:3,p27:1,p28:3,p29:5,p30:0},output:{g1:0.35,g2:0.35,g3:0}},
    {input:{p1:2,p2:2,p3:17,p4:1,p5:3,p6:1,p7:2,p8:3,p9:5,p10:3,p11:1,p12:2,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:1,p23:0,p24:4,p25:4,p26:3,p27:1,p28:1,p29:3,p30:4},output:{g1:0.7,g2:0.75,g3:0.8}}
  ];
  return training_data;
}
function get_testing_data(index){
  var testing_data=[
    {p1:2,p2:2,p3:19,p4:2,p5:3,p6:1,p7:1,p8:1,p9:5,p10:3,p11:5,p12:1,p13:2,p14:1,p15:1,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:4,p25:3,p26:2,p27:1,p28:3,p29:5,p30:0},
    {p1:2,p2:2,p3:18,p4:2,p5:3,p6:1,p7:4,p8:2,p9:5,p10:5,p11:1,p12:2,p13:2,p14:1,p15:1,p16:0,p17:0,p18:1,p19:0,p20:1,p21:1,p22:0,p23:0,p24:5,p25:4,p26:3,p27:4,p28:3,p29:3,p30:0},
    {p1:2,p2:1,p3:18,p4:2,p5:3,p6:1,p7:2,p8:2,p9:4,p10:5,p11:5,p12:1,p13:2,p14:3,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:0,p23:0,p24:5,p25:3,p26:3,p27:1,p28:3,p29:4,p30:0},
    {p1:2,p2:1,p3:17,p4:1,p5:3,p6:1,p7:4,p8:3,p9:1,p10:5,p11:5,p12:1,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:5,p25:5,p26:4,p27:1,p28:1,p29:1,p30:0},
    {p1:2,p2:1,p3:18,p4:2,p5:3,p6:1,p7:4,p8:4,p9:1,p10:4,p11:2,p12:1,p13:3,p14:1,p15:0,p16:0,p17:1,p18:0,p19:1,p20:1,p21:1,p22:1,p23:1,p24:4,p25:4,p26:3,p27:2,p28:2,p29:5,p30:4},
    {p1:2,p2:1,p3:19,p4:2,p5:3,p6:1,p7:2,p8:3,p9:3,p10:5,p11:3,p12:1,p13:1,p14:3,p15:1,p16:0,p17:0,p18:0,p19:1,p20:0,p21:1,p22:1,p23:0,p24:5,p25:4,p26:2,p27:1,p28:2,p29:5,p30:4},
    {p1:2,p2:1,p3:18,p4:1,p5:3,p6:1,p7:3,p8:1,p9:1,p10:3,p11:3,p12:1,p13:1,p14:2,p15:0,p16:0,p17:1,p18:0,p19:0,p20:1,p21:1,p22:1,p23:0,p24:4,p25:3,p26:4,p27:1,p28:1,p29:1,p30:4},
    {p1:2,p2:1,p3:18,p4:1,p5:3,p6:1,p7:1,p8:1,p9:5,p10:5,p11:3,p12:1,p13:2,p14:2,p15:0,p16:0,p17:0,p18:0,p19:1,p20:1,p21:1,p22:0,p23:0,p24:1,p25:1,p26:1,p27:1,p28:1,p29:5,p30:6},
    {p1:2,p2:2,p3:17,p4:1,p5:3,p6:1,p7:3,p8:1,p9:3,p10:3,p11:3,p12:1,p13:2,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:2,p25:4,p26:5,p27:3,p28:4,p29:2,p30:6},
    {p1:2,p2:2,p3:18,p4:2,p5:3,p6:1,p7:3,p8:2,p9:3,p10:5,p11:3,p12:1,p13:3,p14:1,p15:0,p16:0,p17:0,p18:0,p19:0,p20:0,p21:1,p22:1,p23:0,p24:4,p25:4,p26:1,p27:3,p28:4,p29:5,p30:4}
  ];
  return testing_data[index];
}
module.exports = app;
