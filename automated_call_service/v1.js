//Cloud functions for Firebase is used.
require(Modules.AI)

const MAX_NO_INPUT_TIME = 12000
const VOICEBOT_PHONE_NUMBER = "+447482874889"
var dialogflow, call, hangup,
    number,
    waitForCallForwarding = false,
    agent_caller_id = "+442077291000",
    start_date, end_date;

// Fire the "NO_INPUT" event if there is no response for MAX_NO_INPUT_TIME
class Timer {
  constructor() {
    this.expired = false
    this.noInputTimer = null
  }
  start(){
    this.noInputTimer = setTimeout( ()=>{
      this.expired = true
      dialogflow.sendQuery({ event : {name: "NO_INPUT", language_code: "en-GB"}})
      Logger.write("No_Input timer exceeded")
    }, MAX_NO_INPUT_TIME || 30 * 1000)
    Logger.write("No_input timer started")
  }
  stop(){
    this.expired = false
    clearTimeout(this.noInputTimer)
    Logger.write("No_Input timer countdown cleared")
  }
}

// let timer = new Timer()



// Create outbound call as soon as StartScenarios HTTP API arrives
VoxEngine.addEventListener(AppEvents.Started, (e) => {
     start_date = new Date();
     start_date.setSeconds(start_date.getSeconds() - 30);
     Logger.write("Start date:   "+start_date);
    //  httpHandler();
    //onCallDisconnected();
     start_date.setSeconds(start_date.getSeconds() - 30);
     number = VoxEngine.customData() // we assume that a callee's number arrives as customData in e.164 format
     call = VoxEngine.callPSTN(number, VOICEBOT_PHONE_NUMBER)
     call.addEventListener(CallEvents.Connected, onCallConnected)
     call.addEventListener(CallEvents.Disconnected, onCallDisconnected)
     call.addEventListener(CallEvents.Failed, onCallDisconnected)
})

function onCallConnected(e) {
  // Create Dialogflow object
	dialogflow = AI.createDialogflow({
	  lang: DialogflowLanguage.ENGLISH_GB, agentId: 2293
	})
  
  dialogflow.addEventListener(AI.Events.DialogflowResponse, onDialogflowResponse)
  // Sending WELCOME event to let the agent says a welcome message
  dialogflow.sendQuery({event : {name: "WELCOME", language_code:"en-GB"}})
  // Playback marker used for better user experience
  dialogflow.addMarker(-300)
  // Start sending media from Dialogflow to the call
  dialogflow.sendMediaTo(call)
  dialogflow.addEventListener(AI.Events.DialogflowPlaybackFinished, (e) => {
    // Dialogflow TTS playback finished. Hangup the call if hangup flag was set to true
    // timer.start()     
    waitForCallForwarding = false
    if (hangup) {
      call.hangup();
    }
  })
  dialogflow.addEventListener(AI.Events.DialogflowPlaybackStarted, (e) => {
    // Dialogflow TTS playback started
    // timer.stop()
  })
  dialogflow.addEventListener(AI.Events.DialogflowPlaybackMarkerReached, (e) => {
    // Playback marker reached - start sending audio from the call to Dialogflow
    call.sendMediaTo(dialogflow)
  })
}

function onCallDisconnected(){
  end_date = new Date();
  end_date.setSeconds(end_date.getSeconds() + 30);
  Logger.write("****************************");
  let start_datetime = start_date.getFullYear()+'-'+(start_date.getMonth()+1)+'-'+start_date.getDate() + ' '+start_date.getHours()+':'+start_date.getMinutes()+':'+start_date.getSeconds();
  let end_datetime = end_date.getFullYear()+'-'+(end_date.getMonth()+1)+'-'+end_date.getDate()+' '+end_date.getHours()+':'+end_date.getMinutes()+':'+end_date.getSeconds();
  let postData = {
    from_date: start_datetime,
    to_date: end_datetime
  }
  Net.httpRequest("https://us-central1-rhapsodyautomatedcallservice-a.cloudfunctions.net/triggerScheduler", function(e) {
      if(e.code == 200) { 
        Logger.write("Connected successfully");
        Logger.write("code:  " + e.code);
        Logger.write("error:  " + e.error);
        Logger.write("headers:  " + JSON.stringify(e.headers));
        Logger.write("text:  " + e.text);
      } else { 
        Logger.write("Unable to connect to Clound Functions");
      }
    },
    { 
      method: 'POST', 
      postData: JSON.stringify(postData), 
      rawOutput: true 
    } 
  );
  Logger.write("****************************");   
  VoxEngine.terminate;  
}

// Handle Dialogflow responses
function onDialogflowResponse(e) {
  if(e.response.queryResult !== undefined && e.response.queryResult.outputContexts !== undefined){
    let outputContexts = e.response.queryResult.outputContexts[e.response.queryResult.outputContexts.length - 1]
    if (outputContexts.parameters !== undefined && outputContexts.parameters["no-input"] !== undefined && outputContexts.parameters["no-input"] > 4){
        Logger.write("NO-INPUT-COUNT: " + outputContexts.parameters["no-input"])
        if(outputContexts.parameters["no-match"] <= 2){
          call.hangup();
        }
    }
  }
  
  // If DialogflowResponse with queryResult received - the call stops sending media to Dialogflow
  // in case of response with queryResult but without responseId we can continue sending media to dialogflow
  if (e.response.queryResult !== undefined && e.response.responseId === undefined) {
    // if(!timer.expired && !waitForCallForwarding)
    if(!waitForCallForwarding)
      call.sendMediaTo(dialogflow)
  } else if (e.response.queryResult !== undefined && e.response.responseId !== undefined) {
  	// Do whatever required with e.response.queryResult or e.response.webhookStatus
        // If we need to hangup because end of conversation has been reached


        if (e.response.queryResult.diagnosticInfo !== undefined && 
           e.response.queryResult.diagnosticInfo.end_conversation == true) {
           hangup = true
        }

    // Telephony messages arrive in fulfillmentMessages array
    if (e.response.queryResult.fulfillmentMessages != undefined) {
    	e.response.queryResult.fulfillmentMessages.forEach((msg) => {
      		if (msg.platform !== undefined && msg.platform === "TELEPHONY"){
             waitForCallForwarding = true
            Logger.write("Forwarding Call to Real Agent") 
            processTelephonyMessage(msg)
          }
    	})
  	}
  }
}

// Process telephony messages from Dialogflow
function processTelephonyMessage(msg) {
  // Transfer call to msg.telephonyTransferCall.phoneNumber 
  // let newcall = VoxEngine.callPSTN(msg.telephonyTransferCall.phoneNumber, VOICEBOT_PHONE_NUMBER)
  // if (msg.telephonyTransferCall !== undefined) {
    dialogflow.stop()
    let newcall = VoxEngine.callPSTN( agent_caller_id, VOICEBOT_PHONE_NUMBER)
    VoxEngine.easyProcess(call, newcall)
  // }
  // Synthesize speech from msg.telephonySynthesizeSpeech.text
  if (msg.telephonySynthesizeSpeech !== undefined) {
    // See the list of available TTS languages at https://voximplant.com/docs/references/voxengine/language
    // Example: 
    if (msg.telephonySynthesizeSpeech.ssml !== undefined) call.say(msg.telephonySynthesizeSpeech.ssml, {"language": VoiceList.Amazon.en_GB_Brian})
    else call.say(msg.telephonySynthesizeSpeech.text, {"language": VoiceList.Amazon.en_GB_Brian})
  }
  // Play audio file located at msg.telephonyPlayAudio.audioUri
  if (msg.telephonyPlayAudio !== undefined) {
    // audioUri contains Google Storage URI (gs://), we need to transform it to URL (https://)
    let url = msg.telephonyPlayAudio.audioUri.replace("gs://", "https://storage.googleapis.com/")
    // Example: call.startPlayback(url)
  }
}


