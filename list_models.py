from google.genai import Client
import os

client = Client()
for m in client.models.list():
    if "flash" in m.name.lower() or "gemini" in m.name.lower() or "preview" in m.name.lower() or "exp" in m.name.lower():
        print(m.name)
