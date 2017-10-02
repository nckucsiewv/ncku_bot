
'use strict';

const 
  bodyParser = require('body-parser'),
  config = require('config'),
  crypto = require('crypto'),
  express = require('express'),
  https = require('https'),  
  request = require('request');
  
/*// Retrieve
var MongoClient = require('mongodb').MongoClient;
// Connect to the db
MongoClient.connect("mongodb://218.164.15.139:27017/db", function(err, db) {
  if(!err) {
    console.log("We are connected mongodb");
  }
});*/


//require('./lib/db_mongo'); **********************************************            
var mongoose = require('mongoose');       
var brain=require("brain");
//var training_data_model = mongoose.model('training_data');
//var target_data_model = mongoose.model('target_data');
//var device_list_model = mongoose.model('devices');  ***********************
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

/*
 * Authorization Event
 *
 * The value for 'optin.ref' is defined in the entry point. For the "Send to 
 * Messenger" plugin, it is the 'data-ref' field. Read more at 
 * https://developers.facebook.com/docs/messenger-platform/webhook-reference/authentication
 *
 */
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

/*
 * Message Event
 *
 * This event is called when a message is sent to your page. The 'message' 
 * object format can vary depending on the kind of message that was received.
 * Read more at https://developers.facebook.com/docs/messenger-platform/webhook-reference/message-received
 *
 * For this example, we're going to echo any text that we get. If we get some 
 * special keywords ('button', 'generic', 'receipt'), then we'll send back
 * examples of those bubbles to illustrate the special message bubbles we've 
 * created. If we receive a message with an attachment (image, video, audio), 
 * then we'll simply confirm that we've received the attachment.
 * 
 */
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

    sendTextMessage(senderID, "Quick reply tapped");
    return;
  }

  if (messageText) {

    // If we receive a text message, check to see if it matches any special
    // keywords and send back the corresponding example. Otherwise, just echo
    // the text we received.
    switch (messageText) {
      case 'image':
        sendImageMessage(senderID);
        break;

      case 'gif':
        sendGifMessage(senderID);
        break;

      case 'audio':
        sendAudioMessage(senderID);
        break;

      case 'video':
        sendVideoMessage(senderID);
        break;

      case 'file':
        sendFileMessage(senderID);
        break;

      case 'button':
        sendButtonMessage(senderID);
        break;

      case 'generic':
        sendGenericMessage(senderID);
        break;

      case 'receipt':
        sendReceiptMessage(senderID);
        break;

      case 'quick reply':
        sendQuickReply(senderID);
        break;        

      case 'read receipt':
        sendReadReceipt(senderID);
        break;        

      case 'typing on':
        sendTypingOn(senderID);
        break;        

      case 'typing off':
        sendTypingOff(senderID);
        break;        

      case 'account linking':
        sendAccountLinking(senderID);
        break;

      default:
        sendTextMessage(senderID, messageText);
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

  // When a postback is called, we'll send a message back to the sender to 
  // let them know it was successful
  sendTextMessage(senderID, "Postback called");
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
          //url: SERVER_URL + "/assets/rift.png"
		  //url: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ9LX0tn8C_PW1cXBep05JSmrwXpAfCNjByCfEDiHKbwIufubP5Qg"
		url: "https://github.com/minipiglucy0215/robot_sample/blob/master/%E4%B8%8B%E8%BC%89.jpg"
        }
      }
    }
  };

  callSendAPI(messageData);
}
function sendCustomImageMessage(recipientId,image_url) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "image",
        payload: {
          url: image_url
        }
      }
    }
  };

  callSendAPI(messageData);
}
/*
 * Send a Gif using the Send API.
 *
 */
function sendGifMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "image",
        payload: {
          url: SERVER_URL + "/assets/instagram_logo.gif"
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
 * Send audio using the Send API.
 *
 */
function sendAudioMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "audio",
        payload: {
          url: SERVER_URL + "/assets/sample.mp3"
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
 * Send a video using the Send API.
 *
 */
function sendVideoMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "video",
        payload: {
          url: SERVER_URL + "/assets/allofus480.mov"
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
 * Send a file using the Send API.
 *
 */
function sendFileMessage(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "file",
        payload: {
          url: SERVER_URL + "/assets/test.txt"
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
 * Send a text message using the Send API.
 *
 */
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

/*
 * Send a button message using the Send API.
 *
 */
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
          text: "This is test text",
          buttons:[{
            type: "web_url",
            url: "https://www.oculus.com/en-us/rift/",
            title: "Open Web URL"
          }, {
            type: "postback",
            title: "Trigger Postback",
            payload: "DEVELOPER_DEFINED_PAYLOAD"
          }, {
            type: "phone_number",
            title: "Call Phone Number",
            payload: "+16505551234"
          }]
        }
      }
    }
  };  

  callSendAPI(messageData);
}

/*
 * Send a Structured Message (Generic Message type) using the Send API.
 *
 */
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

/*
 * Send a receipt message using the Send API.
 *
 */
function sendReceiptMessage(recipientId) {
  // Generate a random receipt ID as the API requires a unique ID
  var receiptId = "order" + Math.floor(Math.random()*1000);

  var messageData = {
    recipient: {
      id: recipientId
    },
    message:{
      attachment: {
        type: "template",
        payload: {
          template_type: "receipt",
          recipient_name: "Peter Chang",
          order_number: receiptId,
          currency: "USD",
          payment_method: "Visa 1234",        
          timestamp: "1428444852", 
          elements: [{
            title: "Oculus Rift",
            subtitle: "Includes: headset, sensor, remote",
            quantity: 1,
            price: 599.00,
            currency: "USD",
            image_url: SERVER_URL + "/assets/riftsq.png"
          }, {
            title: "Samsung Gear VR",
            subtitle: "Frost White",
            quantity: 1,
            price: 99.99,
            currency: "USD",
            image_url: SERVER_URL + "/assets/gearvrsq.png"
          }],
          address: {
            street_1: "1 Hacker Way",
            street_2: "",
            city: "Menlo Park",
            postal_code: "94025",
            state: "CA",
            country: "US"
          },
          summary: {
            subtotal: 698.99,
            shipping_cost: 20.00,
            total_tax: 57.67,
            total_cost: 626.66
          },
          adjustments: [{
            name: "New Customer Discount",
            amount: -50
          }, {
            name: "$100 Off Coupon",
            amount: -100
          }]
        }
      }
    }
  };

  callSendAPI(messageData);
}

/*
 * Send a message with Quick Reply buttons.
 *
 */
function sendQuickReply(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      text: "What's your favorite movie genre?",
      quick_replies: [
        {
          "content_type":"text",
          "title":"Action",
          "payload":"DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_ACTION"
        },
        {
          "content_type":"text",
          "title":"Comedy",
          "payload":"DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_COMEDY"
        },
        {
          "content_type":"text",
          "title":"Drama",
          "payload":"DEVELOPER_DEFINED_PAYLOAD_FOR_PICKING_DRAMA"
        }
      ]
    }
  };

  callSendAPI(messageData);
}

/*
 * Send a read receipt to indicate the message has been read
 *
 */
function sendReadReceipt(recipientId) {
  console.log("Sending a read receipt to mark message as seen");

  var messageData = {
    recipient: {
      id: recipientId
    },
    sender_action: "mark_seen"
  };

  callSendAPI(messageData);
}

/*
 * Turn typing indicator on
 *
 */
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
 * Turn typing indicator off
 *
 */
function sendTypingOff(recipientId) {
  console.log("Turning typing indicator off");

  var messageData = {
    recipient: {
      id: recipientId
    },
    sender_action: "typing_off"
  };

  callSendAPI(messageData);
}

/*
 * Send a message with the account linking call-to-action
 *
 */
function sendAccountLinking(recipientId) {
  var messageData = {
    recipient: {
      id: recipientId
    },
    message: {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: "Welcome. Link your account.",
          buttons:[{
            type: "account_link",
            url: SERVER_URL + "/authorize"
          }]
        }
      }
    }
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
				 			'今天我要帶給各位滿滿的\n'+
				 			'大！平！台！\n';
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
