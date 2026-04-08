import asyncio
import os
from testing.agent import create_root_agent
from google.genai import Client

# Just to test if creation works:
res = create_root_agent()
print("Result of create_root_agent:", res)

async def test():
    try:
        agent = res
        if isinstance(res, tuple):
            agent = res[0]
        response = await agent.run("say hi")
        print("Run success")
    except Exception as e:
        print("Run Exception:", e)

asyncio.run(test())
