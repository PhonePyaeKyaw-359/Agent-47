with open('frontend/src/components/IntentBlockRenderer.jsx', 'r') as f:
    content = f.read()

bad = 'const template = "1. 📌 Purpose of the event:\n\n2. 📋 Agenda:\n\n3. 🔗 Important links:\n\n4. 👥 Instructions for participants:\n\n5. 📎 Extra context / notes:\n";'
good = 'const template = "1. 📌 Purpose of the event:\\n\\n2. 📋 Agenda:\\n\\n3. 🔗 Important links:\\n\\n4. 👥 Instructions for participants:\\n\\n5. 📎 Extra context / notes:\\n";'

content = content.replace(bad, good)
with open('frontend/src/components/IntentBlockRenderer.jsx', 'w') as f:
    f.write(content)
