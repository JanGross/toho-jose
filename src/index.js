require('dotenv').config()
const express = require("express");
var crypto = require('crypto');
const { finished } = require("stream");
const uuid = require("uuid");
const axios = require("axios");
const path  = require("path")
const fs = require("fs");
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

let nodeIndex = 0;
let nodes = {}; 

app.use(express.json({ limit: 10000000 }));

app.get('/', (req, res) => {
  res.send('Job handling server')
})

app.use('/example', express.static(path.join(__dirname, 'example')));

app.get('/status', (req, res) => {
  let queued = Object.values(jobs['queued']);
  let clients = Array.from(wss.clients);
  res.json( 
    {
      'nodes': {
        'clients': clients,
        'count': clients.length
      },
      'jobs': {
        'queued': { 'count': queued.length, 'items': queued  },
      } 
    }
  );
});

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
  console.log(`Received Job ${jobId}`);
  let nodes = Array.from(wss.clients);
  nodeIndex = nodes.length === 0 ? 0 : ++nodeIndex % nodes.length;
  var client = nodes[nodeIndex];
  if(!client) {
    res.status(503).json({ 'message': 'No render nodes available', 'jobId': jobId });
    delete jobs['queued'][jobId];
    console.log(`Rejected Job ${jobId}! No render nodes available`);
    return;
  }
  client.send(JSON.stringify({"job": req.body}));
  let response = new Promise(function (resolve, reject){
    jobs['queued'][jobId]['promise'] = {resolve: resolve, reject: reject}; 
  });
  console.log(`Sent job to node ${nodeIndex+1}/${nodes.length} `, client.nodeID);
  let result = await response.then(ResolveJob)
  res.json({ 'jobId': jobId, "path": result["value"] });
});

wss.on('connection', function connection(ws) {
  ws.isAlive = true;
  var nodeID = uuid.v4();
  console.log("New connection from", nodeID)
  ws.on('error', console.error);

  ws.on('message', function message(data) {
    let request = JSON.parse(data);
    
    if(request["register"]){
      if(request["register"]["auth_key"] !== process.env.NODE_AUTH_KEY) {
        console.log("INVALID AUTH KEY. Disconnecting ", nodeID);
        ws.close(4000, "Invalid auth key");
        return;
      }
      nodeID = `${nodeID}-${request["register"]["hostname"]}`;
      ws.send(JSON.stringify({"welcome": { "clientId": nodeID }}));
      ws.nodeID = nodeID;
      nodes[nodeID] = ws
      console.log("Node registered", nodeID);
    }
    
    if(request["result"]) {
      let jobResult = request["result"]
      if(jobResult["type"] === "URL") {
        jobs['queued'][jobResult["jobId"]]['promise'].resolve(jobResult);
        return;
      }
      if(jobResult["type"] === "B64:PNG") {
        let [filePath, data] = jobResult["value"].split(":");
        let fileName = path.basename(filePath);
        console.log(`Recevied image data. Serving as ${fileName}`)
        
        console.log(`Saving to file ./public/${fileName}`)
        fs.writeFileSync(`./public/${fileName}`, data, "base64", function(err) {
          console.log(err);
        });

        jobResult["value"] = `${process.env.PUBLIC_URL}/${fileName}`;
        jobs['queued'][jobResult["jobId"]]['promise'].resolve(jobResult);
      }
    }
  });

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('close', function(reasonCode, description) {
    console.log(`Node ${ws.nodeID} disconnected.`);
    delete nodes[ws.nodeID]
  });
});

const timeoutConnections = setInterval(() => {
  for (const [id, node] of Object.entries(nodes)) {
    if (node.isAlive === false) {
      console.log(`Node considered dead ${id}`);
      return node.terminate();
    }

    node.isAlive = false;
    node.ping('ping');
  };
}, 5000);

app.use('/public', express.static('public'));

app.listen(PORT_WEB, () => {
    console.log(`Job Server API running on ${PORT_WEB}`);
})
