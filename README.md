# Render Job Server

## Endpoints:
- [GET] / 
  - Returns a string "Job handling server"
- [GET] /jobs  
  - Returns a JSON object containing a count and items for the `queued`, `waiting`, and `finished` jobs.
- [POST] /jobs  
  - Accepts a JSON object in the request body, generates a unique job ID using an MD5 hash, and adds the job to the `queued` jobs object. The generated job ID and a status code of `200` are returned in the response.
- [GET] /batch  
  - Returns a JSON object containing a count and items for jobs from the `queued` object in the amount specified in the `size` query parameter, or the amount of items in the `queued` object, whichever is smaller.  
    The returned jobs are added to the `waiting` jobs object and removed from the `queued` jobs object.
- [POST] /jobs/:jobId/completed  
  - Accepts a jobId in the path parameter, marks it as completed and moves it from waiting to finished.
