@echo off
echo Starting Peerrank backend...
echo Open http://localhost:8000/app/ in your browser
.venv\Scripts\uvicorn.exe app.main:app --host 0.0.0.0 --port 8000 --reload
