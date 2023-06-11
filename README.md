![jose-banner](https://github.com/JanGross/toho-jose/assets/13641301/39ec06b4-342e-4353-a6d4-6fc622321566)

## Render-Job server for Toho-Miku
## Endpoints:
- [GET] / 
  - Returns a string "Job handling server"
- [GET] /jobs  
  - Returns a JSON object containing a count and items for the `queued`, `waiting`, and `finished` jobs.
- [POST] /jobs  
  - Accepts a JSON object in the request body, generates a unique job ID using an MD5 hash, and adds the job to the `queued` jobs object. The generated job ID and a status code of `200` are returned in the response.
