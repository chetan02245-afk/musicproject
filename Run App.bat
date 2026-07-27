@echo off
echo Starting AI Music Source Separation Server...
echo The web interface will open in your default browser.
start "" http://127.0.0.1:5000
python.exe app.py
pause
