#!/bin/bash
# Lambda handler: the Lambda Web Adapter layer (AWS_LAMBDA_EXEC_WRAPPER=/opt/bootstrap) runs this, waits
# for /api/health to answer on port 8000, then forwards each request to it.
exec python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
