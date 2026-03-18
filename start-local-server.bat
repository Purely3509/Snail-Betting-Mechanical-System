@echo off
cd /d "%~dp0"
echo Starting local server for Snail Betting...
echo.
echo Leave this window open while you play.
echo Open this in your browser:
echo http://127.0.0.1:8000/index.html
echo.
python -m http.server 8000 --bind 127.0.0.1
