require(Modules.AI)

const MAX_NO_INPUT_TIME = 9000
const VOICEBOT_PHONE_NUMBER = "+447482874889"
var dialogflow, call, hangup,
    number,
    waitForCallForwarding = false,
    agent_caller_id = "+442077291000",
    content_creator_name = "Lloyd",
    order_ref = "Engine publication",
    due_date = new Date();

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

let timer = new Timer()


// Create outbound call as soon as StartScenarios HTTP API arrives
VoxEngine.addEventListener(AppEvents.Started, (e) => {
     number = VoxEngine.customData() // we assume that a callee's number arrives as customData in e.164 format
     call = VoxEngine.callPSTN(number, VOICEBOT_PHONE_NUMBER)
     call.addEventListener(CallEvents.Connected, onCallConnected)
     call.addEventListener(CallEvents.Disconnected, VoxEngine.terminate)
     call.addEventListener(CallEvents.Failed, VoxEngine.terminate)
})

function onCallConnected(e) {
  // Create Dialogflow object
	dialogflow = AI.createDialogflow({
	  lang: DialogflowLanguage.ENGLISH_GB, agentId: 2157
	})
  
  dialogflow.addEventListener(AI.Events.DialogflowResponse, onDialogflowResponse)
  // Sending WELCOME event to let the agent says a welcome message
  due_date.setHours(16);
  due_date.setMinutes(0);
  due_date.setSeconds(0);
  dialogflow.sendQuery({event : {name: "WELCOME", parameters: {"content-creator": content_creator_name, "order-ref": order_ref, "due-date": due_date}, language_code:"en-GB"}})
  // Playback marker used for better user experience
  dialogflow.addMarker(-300)
  // Start sending media from Dialogflow to the call
  dialogflow.sendMediaTo(call)
  dialogflow.addEventListener(AI.Events.DialogflowPlaybackFinished, (e) => {
    // Dialogflow TTS playback finished. Hangup the call if hangup flag was set to true
    timer.start()     
    waitForCallForwarding = false
    if (hangup) call.hangup()
  })
  dialogflow.addEventListener(AI.Events.DialogflowPlaybackStarted, (e) => {
    // Dialogflow TTS playback started
    timer.stop()
  })
  dialogflow.addEventListener(AI.Events.DialogflowPlaybackMarkerReached, (e) => {
    // Playback marker reached - start sending audio from the call to Dialogflow
    call.sendMediaTo(dialogflow)
  })
}

// Handle Dialogflow responses
function onDialogflowResponse(e) {
  if(e.response.queryResult !== undefined && e.response.queryResult.outputContexts !== undefined){
    let outputContexts = e.response.queryResult.outputContexts[e.response.queryResult.outputContexts.length - 1]
    if (outputContexts.parameters !== undefined && outputContexts.parameters["no-input"] !== undefined && outputContexts.parameters["no-input"] > 4){
        Logger.write("NO-INPUT-COUNT: " + outputContexts.parameters["no-input"])
        if(outputContexts.parameters["no-match"] <= 2){
          call.hangup()
        }
        
    }
  }
  
  // If DialogflowResponse with queryResult received - the call stops sending media to Dialogflow
  // in case of response with queryResult but without responseId we can continue sending media to dialogflow
  if (e.response.queryResult !== undefined && e.response.responseId === undefined) {
    if(!timer.expired && !waitForCallForwarding)
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

