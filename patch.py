import re

with open('backend/agents/calendar_agent.py', 'r') as f:
    content = f.read()

new_instruction = """  - DETAILED DESCRIPTION: When creating or updating an event, use the description field as a detailed notes section for the event. Explain the full context and instructions. Structure it like this (include relevant parts based on user input):
      1. 📌 Purpose of the event (e.g., "Weekly FlickShare growth sync")
      2. 📋 Agenda (List what will happen, e.g., 1. Review metrics 2. Demo new feature)
      3. 🔗 Important links (e.g., Docs, GitHub, Figma)
      4. 👥 Instructions for participants (e.g., "Bring latest analytics data", "Prepare demo slides")
      5. 📎 Extra context / notes (e.g., "This meeting is recorded")
"""

content = content.replace("        \"RULES:\\n\"", "        \"RULES:\\n\"\n        \"" + new_instruction.replace('"', '\\"') + "\"\n")

with open('backend/agents/calendar_agent.py', 'w') as f:
    f.write(content)
