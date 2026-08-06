import os
import sys

# Add the current directory to Python path
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

# Import the app from main.main module

# This ensures the app is available at module level for uvicorn
# When using: uvicorn main:app
# It will look for the 'app' variable in this main.py file

# This is for local development only
# if __name__ == "__main__":
#     import uvicorn
#     # App Engine expects the app to run on port 8080
#     port = int(os.environ.get("PORT", 8080))
#     uvicorn.run(app, host="0.0.0.0", port=port)
