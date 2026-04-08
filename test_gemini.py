import asyncio
from google.adk import Agent

async def main():
    agent = Agent(name="test_agent", model="gemini-3-flash-preview", instruction="say hi")
    try:
        response = await agent.run("hi")
        print("Success:", response)
    except Exception as e:
        print("Error:", e)

asyncio.run(main())
