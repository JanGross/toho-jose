const express = require("express");
var crypto = require('crypto');
const { finished } = require("stream");
const uuid = require("uuid");
const axios = require("axios");
const path  = require("path")
const { WebSocketServer } = require("ws");
const { request } = require("http");

const PORT_WEB = 6968;
const PORT_WSS = 6980;

const app = express();
const wss = new WebSocketServer({ port: PORT_WSS });
console.log(`Websocket listening on port ${PORT_WSS}`);

let jobs = {
    queued: {},
    waiting: {},
    finished: {}
}

let nodes = {}; 

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Job handling server')
})

app.use('/example', express.static(path.join(__dirname, 'example')));

app.get('/jobs', (req, res) => {
  let queued = Object.values(jobs['queued']);

  res.json( 
    { 
      'jobs': {
        'queued': { 'count': queued.length, 'items': queued  },
      } 
    }
  );
});

function ResolveJob(result){
  let jobId = result["jobId"];
  console.log(`Completed Job ${jobId}`);
  delete jobs['queued'][jobId];
  return result;
}

app.post("/jobs", async (req, res) => {
  const data = req.body;
  let jobId = uuid.v4();

  jobs['queued'][jobId] = req.body;
  jobs['queued'][jobId]['jobId'] = jobId;
  console.log(`Queued Job ${jobId}`);
  var client = Array.from(wss.clients)[0];
  if(!client) {
    res.status(503).json({ 'message': 'No render nodes available', 'jobId': jobId });
    return;
  }
  client.send(JSON.stringify({"job": req.body}));
  let response = new Promise(function (resolve, reject){
    jobs['queued'][jobId]['promise'] = {resolve: resolve, reject: reject}; 
  });
  console.log("Sent job to node", client.nodeID);
  let result = await response.then(ResolveJob)
  res.json({ 'jobId': jobId, "path": result["path"] });
});

wss.on('connection', function connection(ws) {
  var nodeID = uuid.v4();
  ws.nodeID = nodeID;
  nodes[nodeID] = ws
  console.log("New connection from", nodeID)
  ws.on('error', console.error);

  ws.on('message', function message(data) {
    let request = JSON.parse(data);
    console.log('received: %s', data);

    if(request["register"]){
      ws.send(JSON.stringify({"welcome": { "clientId": nodeID }}));
      console.log("Node registered", nodeID);
    }

    if(request["result"]) {
      let jobResult = request["result"]
      jobs['queued'][jobResult["jobId"]]['promise'].resolve(jobResult);
    }
  });
  ws.on('close', function(reasonCode, description) {
    console.log(`Node ${ws.nodeID} disconnected.`);
    delete nodes[ws.nodeID]
  });
});


app.listen(PORT_WEB, () => {
    console.log(`Job Server API running on ${PORT_WEB}`);
})