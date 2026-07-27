import sys
import os

# Include parent directory in sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app

# Vercel WSGI entry point
app = app
