import requests
import json

try:
    res = requests.post('http://localhost:8000/api/draft-email-body', json={
        'user_id': 'default_user',
        'payload': {
            'subject': 'Hello from test',
            'to': 'test@example.com'
        }
    })
    print(res.status_code)
    print(res.text)
except Exception as e:
    print("Error:", e)
