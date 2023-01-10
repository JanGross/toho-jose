const express = require("express");
var crypto = require('crypto');
const { finished } = require("stream");

const app = express();

const PORT = 6968;

let jobs = {
    queued: {},
    waiting: {},
    finished: {}
}

app.use(express.json());

app.get('/', (req, res) => {
  res.send('Job handling server')
})

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


app.post("/jobs", (req, res) => {
  const data = req.body;
  let jobId = crypto.createHash('md5').update(JSON.stringify(req.body)).digest('hex');

  if (jobs['queued'][jobId] || jobs['waiting'][jobId]) {
    res.status(409).json({ 'message': 'Request already queued or processing!', 'jobId': jobId });
    return;
  }

  jobs['queued'][jobId] = req.body;
  jobs['queued'][jobId]['jobId'] = jobId;
  console.log(`Queued Job ${jobId}`);
  res.json({ 'jobId': jobId });
});
app.listen(PORT, () => {
    console.log("Job Server running")
})