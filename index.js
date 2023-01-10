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

app.listen(PORT, () => {
    console.log("Job Server running")
})