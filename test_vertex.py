import os, asyncio
os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "1"
os.environ.setdefault("GOOGLE_CLOUD_PROJECT", "civic-rhythm-426412-v5")
os.environ.setdefault("GOOGLE_CLOUD_LOCATION", "us-central1")

from google.genai import Client

# Test 1: Does the Client detect vertexai mode?
try:
    c = Client()
    print("Client created OK, vertexai =", c._api_client.vertexai)
except Exception as e:
    print("Client() failed:", e)

# Test 2: Try with explicit vertexai=True
try:
    c2 = Client(vertexai=True)
    print("Client(vertexai=True) OK")
    # Try listing models containing "flash"
    for m in c2.models.list():
        if "3" in m.name and "flash" in m.name:
            print("  Found:", m.name)
except Exception as e:
    print("Client(vertexai=True) failed:", e)
