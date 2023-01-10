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


app.listen(PORT, () => {
    console.log("Job Server running")
})