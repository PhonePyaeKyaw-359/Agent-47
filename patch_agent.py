with open('backend/agent.py', 'r') as f:
    content = f.read()

content = content.replace(
    '\"body\": \"(draft content)\"',
    '\"body\": \"(Write the actual drafted email body here based on the subject and user context)\"'
)

with open('backend/agent.py', 'w') as f:
    f.write(content)
