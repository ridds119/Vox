require(Modules.AI)

const MAX_NO_INPUT_TIME = 12000
const VOICEBOT_PHONE_NUMBER = "+448081891067"
var dialogflow, call, hangup,
  waitForCallForwarding = false,
  agent_caller_id = "+443450542994",
  html = "<!DOCTYPE html><html><body>",
  sessionId, userNumber, contactName = "Unknown", 
  parsedData, recipient="all@rhapsodymedia.com";

// Fire the "NO_INPUT" event if there is no response for MAX_NO_INPUT_TIME
class Timer {
  constructor() {
    this.expired = false
    this.noInputTimer = null
  }
  start() {
    this.noInputTimer = setTimeout(() => {
      this.expired = true
      if(!waitForCallForwarding){
        dialogflow.sendQuery({ event: { name: "NO_INPUT", language_code: "en-GB" } })
        Logger.write("No_Input timer exceeded: " + waitForCallForwarding)
      }
    }, MAX_NO_INPUT_TIME || 30 * 1000)
    Logger.write("No_input timer started")
  }
  stop() {
    this.expired = false
    clearTimeout(this.noInputTimer)
    Logger.write("No_Input timer countdown cleared")
  }
}

let timer = new Timer()

VoxEngine.addEventListener(AppEvents.Started, (e) => {
  sessionId = e.sessionId
  Logger.write("sessionId is: " + sessionId)
  let customData = VoxEngine.customData()
  try{
    if(customData){
      parsedData = JSON.parse(customData);
      if(parsedData.agent_caller_id !== undefined)
      {
        agent_caller_id = parsedData.agent_caller_id
      }
      if(parsedData.recipient !== undefined)
      {
        recipient = parsedData.recipient
      }
    }
  }catch(err){
    Logger.write(err);
  }
});
// Inbound call processing
VoxEngine.addEventListener(AppEvents.CallAlerting, (e) => {
  call = e.call
  html += `<h4 style="align:center"><u>New Incoming Call</u></h4><hr><p style="background-color:yellow;"><b>Voice-bot Number</b>: ${VOICEBOT_PHONE_NUMBER}</p>`;
  userNumber = e.callerid;
  if (userNumber !== undefined && userNumber !== '') {
    html += `<p style="background-color:yellow;"><b>Calling Number</b>: ${userNumber}</p>`;
  }
  Logger.write("Vox engine started: " + e + "  " + e.call)
  call.addEventListener(CallEvents.Connected, onCallConnected)
  call.addEventListener(CallEvents.Disconnected, onCallDisconnected)
  call.answer()
})

function onCallConnected(e) {
  // Create Dialogflow object
  html += `<hr><p> Call connected on: <font style="color:#07a;">  ${new Date().toDateString()}</font> at <font style="color:#07a;">${new Date().toTimeString()}</font></p><hr></body></html>`
  dialogflow = AI.createDialogflow({
    lang: DialogflowLanguage.ENGLISH_GB,
    agentId: 2412
  })
  dialogflow.addEventListener(AI.Events.DialogflowResponse, onDialogflowResponse)
  // Sending WELCOME event to let the agent says a welcome message
  dialogflow.sendQuery({ event: { name: "WELCOME", language_code: "en-GB" } })
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
function onCallDisconnected() {
  dialogflow.stop()
  Logger.write("CONTACT NAME:  "+ contactName);
  html += `<hr><p> Call disconnected on: <font style="color:#07a;">  ${new Date().toDateString()}</font> at <font style="color:#07a;">${new Date().toTimeString()}</font></p><hr>`
  
  try {
    Net.sendMail("smtp.gmail.com",
      "call.bot@rhapsodymedia.com",
      recipient,
      `Message for ${contactName}`,
      "",
      function stub() { },
      { login: "call.bot@rhapsodymedia.com", password: "!GRBpp549", html: html, cc: "riddhik@mindfiresolutions.com" });
  } catch (e) {
    Logger.write(e)
  }
  VoxEngine.terminate;
}
// Handle Dialogflow responses
function onDialogflowResponse(e) {
  if (e.response.queryResult !== undefined) {
    // If DialogflowResponse with queryResult received - the call stops sending media to Dialogflow
    // in case of response with queryResult but without responseId we can continue sending media to dialogflow
    if (e.response.responseId === undefined) {
      if (!timer.expired && !waitForCallForwarding)
        call.sendMediaTo(dialogflow)
    } else if (e.response.responseId !== undefined) {

      if (e.response.queryResult.queryText !== undefined) {
        html += `<p style="background-color:#f5f5f5;"><b> User</b>: ${e.response.queryResult.queryText} </p>`
      }
      if (e.response.queryResult.fulfillmentText !== undefined) {
        html += `<p style="background-color:#f5f5f5;"><b> Agent</b>: ${e.response.queryResult.fulfillmentText} </p>`
      }
      if (e.response.queryResult.outputContexts !== undefined) {
        let outputContexts = e.response.queryResult.outputContexts[e.response.queryResult.outputContexts.length - 1]
        if (outputContexts.parameters !== undefined && outputContexts.parameters["no-input"] !== undefined && outputContexts.parameters["no-input"] > 4) {
          Logger.write("NO-INPUT-COUNT: " + outputContexts.parameters["no-input"])
          if (outputContexts.parameters["no-match"] <= 2) {
            call.hangup();
          }
        }
      }
      if (contactName === "Unknown" && e.response.queryResult.parameters !== undefined && e.response.queryResult.parameters["contact-name"] !== undefined){
        if(e.response.queryResult.parameters["contact-name"].name !== undefined){
          contactName = e.response.queryResult.parameters["contact-name"].name
        }else{
          contactName = e.response.queryResult.parameters["contact-name"]
        }
      }
      // If we need to hangup because end of conversation has been reached
      if (e.response.queryResult.diagnosticInfo !== undefined &&
        e.response.queryResult.diagnosticInfo.end_conversation == true) {
        hangup = true
      }
      // Telephony messages arrive in fulfillmentMessages array
      if (e.response.queryResult.fulfillmentMessages != undefined) {
        e.response.queryResult.fulfillmentMessages.forEach((msg) => {
          if (msg.platform !== undefined && msg.platform === "TELEPHONY") {
            waitForCallForwarding = true
            Logger.write("Forwarding Call to Real Agent")
            processTelephonyMessage(msg)
          }
        })
      }
    }
  }
}

// Process telephony messages from Dialogflow
function processTelephonyMessage(msg) {
  // Transfer call to msg.telephonyTransferCall.phoneNumber
  // if (msg.telephonyTransferCall !== undefined) {
  html += `<hr><p>Forwarding call to ${agent_caller_id}</p>`
  dialogflow.stop()
  let newcall = VoxEngine.callPSTN(agent_caller_id, VOICEBOT_PHONE_NUMBER)
  VoxEngine.easyProcess(call, newcall)
  newcall.addEventListener(CallEvents.Disconnected, onCallDisconnected)
  newcall.addEventListener(CallEvents.Failed, onCallDisconnected)
  // }
  // Synthesize speech from msg.telephonySynthesizeSpeech.text
  if (msg.telephonySynthesizeSpeech !== undefined) {

    if (msg.telephonySynthesizeSpeech.ssml !== undefined) call.say(msg.telephonySynthesizeSpeech.ssml, { "language": VoiceList.Amazon.en_GB_Brian })
    else call.say(msg.telephonySynthesizeSpeech.text, { "language": VoiceList.Amazon.en_GB_Brian })
  }
  // Play audio file located at msg.telephonyPlayAudio.audioUri
  if (msg.telephonyPlayAudio !== undefined) {
    // audioUri contains Google Storage URI (gs://), we need to transform it to URL (https://)
    let url = msg.telephonyPlayAudio.audioUri.replace("gs://", "https://storage.googleapis.com/")
    // Example: call.startPlayback(url)
  }
}