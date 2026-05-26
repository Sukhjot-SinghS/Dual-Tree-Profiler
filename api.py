from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
import subprocess
import json
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ActionRequest(BaseModel):
    action_type: str
    value: int
    history: List[str]

def run_engine(executable_name: str, request: ActionRequest):
    exe_path = f"./{executable_name}.exe" if os.path.exists(f"./{executable_name}.exe") else f"./{executable_name}"
    
    if not os.path.exists(exe_path):
        return {"error": "OFFLINE"}

    args = [exe_path] + request.history
    args.append(f"{request.action_type}{request.value}")

    try:
        result = subprocess.run(args, capture_output=True, text=True, check=True)
        output_str = result.stdout.strip()
        
        if not output_str: 
            return {"animation_frames": []}
            
        return json.loads(output_str)
        
    except subprocess.CalledProcessError as e:
        print(f"[{executable_name}] C++ Crash: {e.stderr}")
        return {"error": "CRASHED"}
    except Exception as e:
        print(f"[{executable_name}] Python API Error: {e}")
        return {"error": "CRASHED"}

@app.post("/api/action/{engine}")
async def process_single_action(engine: str, request: ActionRequest):
    valid_engines = ["avl", "rbt"]
    if engine not in valid_engines:
        raise HTTPException(status_code=400, detail="Invalid engine requested.")
    return run_engine(engine, request)

@app.get("/api/health")
async def health_check():
    return {"status": "Dual-Core API Online. Ready for AVL and RBT."}