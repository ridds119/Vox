// Call TYPE: OUTBOUND CALLS
// PURPOSE: The voicebot will attend the call in the out of hours Company time, will have conversation with the caller and send the conversation via an email back to the company.
require(Modules.AI)

const MAX_NO_INPUT_TIME = 12000
const VOICEBOT_PHONE_NUMBER = "+447482874889"
var dialogflow, call, hangup,
    number,
    waitForCallForwarding = false,
    agent_caller_id = "+442077291000",
    html="<!DOCTYPE html><html><body>",
    sessionId;

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
  sessionId = e.sessionId
     number = VoxEngine.customData() // we assume that a callee's number arrives as customData in e.164 format
     call = VoxEngine.callPSTN(number, VOICEBOT_PHONE_NUMBER)
     html += `<h4 style="align:center"><u>New Call Initiated</u></h4><hr><p style="background-color:yellow;"><b>Voice-bot Number</b>: ${VOICEBOT_PHONE_NUMBER}</p><p style="background-color:yellow;"><b>Dialed Number</b>: ${number}</p><hr>`;            
     call.addEventListener(CallEvents.Connected, onCallConnected)
     call.addEventListener(CallEvents.Disconnected, onCallDisconnected)
     call.addEventListener(CallEvents.Failed, onCallDisconnected)
})

function onCallConnected(e) {
  // Create Dialogflow object
  html += `<p> Call connected on: <font style="color:#07a;">  ${new Date().toDateString()}</font> at <font style="color:#07a;">${new Date().toTimeString()}</font></p><hr>`
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
  dialogflow.stop()
  html += `<hr><p> Call disconnected on: <font style="color:#07a;">  ${new Date().toDateString()}</font> at <font style="color:#07a;">${new Date().toTimeString()}</font></p><hr>`
  Logger.write("############ html ############")
  Logger.write(html)
  try{
    Net.sendMail("smtp.gmail.com",
    "call.bot@rhapsodymedia.com",
    "ridds119@gmail.com",
    `session-id: ${sessionId}`,
    "",
    function stub(){},
    {login: "call.bot@rhapsodymedia.com", password:"!GRBpp549", html: html, cc: "riddhik@mindfiresolutions.com" });
  }catch(e){
    Logger.write(e)
  }

  Logger.write("****************************");   
  VoxEngine.terminate;  
}

// Handle Dialogflow responses
// function onDialogflowResponse(e) {
//   Logger.write("RESPONSE RECEIVED IS:  " + e.response.queryResult)
//   if(e.response.queryResult !== undefined && e.response.queryResult.queryText !== undefined){
//     html += `<p style="background-color:#f5f5f5;"><b> User</b>: ${e.response.queryResult.queryText} </p>`
//   }
//   if(e.response.queryResult !== undefined && e.response.queryResult.fulfillmentText !== undefined){
//     html += `<p style="background-color:#f5f5f5;"><b> Agent</b>: ${e.response.queryResult.fulfillmentText} </p>`
//   }
//   if(e.response.queryResult !== undefined && e.response.queryResult.outputContexts !== undefined){
//     let outputContexts = e.response.queryResult.outputContexts[e.response.queryResult.outputContexts.length - 1]
//     if (outputContexts.parameters !== undefined && outputContexts.parameters["no-input"] !== undefined && outputContexts.parameters["no-input"] > 3){
//         Logger.write("NO-INPUT-COUNT: " + outputContexts.parameters["no-input"])
//         if(outputContexts.parameters["no-match"] <= 2){
//           call.hangup();
//         }
//     }
//   }
  
//   // If DialogflowResponse with queryResult received - the call stops sending media to Dialogflow
//   // in case of response with queryResult but without responseId we can continue sending media to dialogflow
//   if (e.response.queryResult !== undefined && e.response.responseId === undefined) {
//     if(!timer.expired && !waitForCallForwarding)
//       call.sendMediaTo(dialogflow)
//   } else if (e.response.queryResult !== undefined && e.response.responseId !== undefined) {
//    // Do whatever required with e.response.queryResult or e.response.webhookStatus
//         // If we need to hangup because end of conversation has been reached
//         if (e.response.queryResult.diagnosticInfo !== undefined &&
//            e.response.queryResult.diagnosticInfo.end_conversation == true) {
//            hangup = true
//         }

//     // Telephony messages arrive in fulfillmentMessages array
//     if (e.response.queryResult.fulfillmentMessages != undefined) {
//      e.response.queryResult.fulfillmentMessages.forEach((msg) => {
//        if (msg.platform !== undefined && msg.platform === "TELEPHONY"){
//           waitForCallForwarding = true
//           Logger.write("Forwarding Call to Real Agent") 
//           processTelephonyMessage(msg)
//        } 
//      })
//    }
//   }
// }



function onDialogflowResponse(e) {
  if(e.response.queryResult !== undefined && e.response.queryResult.queryText !== undefined){
    html += `<p style="background-color:#f5f5f5;"><b> User</b>: ${e.response.queryResult.queryText} </p>`
  }
  if(e.response.queryResult !== undefined && e.response.queryResult.fulfillmentText !== undefined){
    html += `<p style="background-color:#f5f5f5;"><b> Agent</b>: ${e.response.queryResult.fulfillmentText} </p>`
  }
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


