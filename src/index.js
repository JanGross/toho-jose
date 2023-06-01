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
  let waiting = Object.values(jobs['waiting']);
  let finished = Object.values(jobs['finished']);

  res.json( 
    { 
      'jobs': {
        'queued': { 'count': queued.length, 'items': queued  },
        'waiting': { 'count': waiting.length, 'items': waiting },
        'finished': { 'count': finished.length, 'items': finished },
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
  let jobId = crypto.createHash('md5').update(JSON.stringify(req.body)).digest('hex');

  if (jobs['queued'][jobId] || jobs['waiting'][jobId]) {
    res.status(409).json({ 'message': 'Request already queued or processing!', 'jobId': jobId });
    return;
  }

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

app.get("/batch", async (req, res) => {
  let queued = Object.values(jobs['queued']);
  const batchSize = req.query.size || Math.min(queued.length, 10);
  let assignedJobs = []
  for (let index = 0; index < batchSize; index++) {
    let job = queued[index]
    assignedJobs.push(job);
    jobs['waiting'][job['jobId']] = job;
    delete jobs['queued'][job['jobId']];
    console.log(`Handed out Job ${job['jobId']}`);
  }
  res.json({ 'count': assignedJobs.length, 'jobs': assignedJobs });
});

app.post("/jobs/:jobId/completed", async (req, res) => {
    const jobId = req.params.jobId;
    const jobResult = req.body;

    if(jobs['queued'][jobId]) {
      res.status(400).send({ 'message': 'This Job has not been handed out yet!' });
      return;
    }

    if (jobs['waiting'][jobId]) {
      jobs['finished'][jobId] = jobs['waiting'][jobId];
      jobs['finished'][jobId]['result'] = jobResult;
      delete jobs['waiting'][jobId];
      console.log(`Completed Job ${jobId}`);
      res.json({message: `Job successfully completed`});

      let callbackUrl = jobs['finished'][jobId]['callback'];
      if(callbackUrl) {
        axios.post(callbackUrl, JSON.stringify(jobResult), {
          headers: {
          'Content-Type': 'application/json'
        }})
        .then(response => {
          console.log(`Callback Succesful for Job ${jobId}`);
        })
        .catch(error => {
          console.log(`Callback Error on Job ${jobId}: ${error}`);
        });
      }
      return;
    }

    if(jobs['finished'][jobId]) {
      res.status(400).send({ 'message': 'Job already completed!' });
      return;
    }

    res.status(400).send({ 'message': `Job ${jobId} not found` });
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