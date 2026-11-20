import base64
import cv2
import numpy as np
import os
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from tensorflow.keras.models import load_model

app = FastAPI()

# --- CORS Middleware ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Model Loading ---
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_PATH = os.path.join(BASE_DIR, "models", "Final_Crack_Detection_Model.keras")
model = load_model(MODEL_PATH)
print(f"Model loaded successfully from: {MODEL_PATH}")

# ==========================================
# ROUTE 1: WebSocket for Live Camera
# ==========================================
@app.websocket("/ws/crack")
async def crack_websocket(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            # Receive JSON instead of raw text
            data = await websocket.receive_json()
            base64_str = data.get("image")
            threshold = float(data.get("threshold", 0.5))
            
            try:
                img_bytes = base64.b64decode(base64_str.split(",")[1])
                frame = cv2.imdecode(np.frombuffer(img_bytes, np.uint8), cv2.IMREAD_COLOR)
                if frame is None:
                    continue

                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                x = cv2.resize(rgb, (128, 128)).astype(np.float32) / 255.0
                x = np.expand_dims(x, axis=0)

                pred = float(model.predict(x, verbose=0)[0][0])
                
                if pred > threshold:
                    label, conf = "No Crack", pred
                else:
                    label, conf = "Crack Detected", 1 - pred

                await websocket.send_text(f"{label} ({conf * 100:.1f}%)")
            except Exception as e:
                await websocket.send_text(f"Error: {e}")
    except WebSocketDisconnect:
        print("Client disconnected")

# ==========================================
# ROUTE 2: HTTP POST for Image Upload
# ==========================================
@app.post("/api/predict-upload")
async def predict_upload(file: UploadFile = File(...)):
    try:
        # Read the uploaded file into memory
        contents = await file.read()
        
        # Decode it into an OpenCV image
        nparr = np.frombuffer(contents, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if frame is None:
            return {"error": "Could not decode image"}

        # Preprocess (matches training and webcam)
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        x = cv2.resize(rgb, (128, 128)).astype(np.float32) / 255.0
        x = np.expand_dims(x, axis=0)

        # Predict
        pred = float(model.predict(x, verbose=0)[0][0])
        
        if pred > 0.5:
            label = "No Crack"
            conf = pred
        else:
            label = "Crack Detected"
            conf = 1.0 - pred

        return {
            "label": label,
            "confidence": round(conf * 100, 2)
        }
    except Exception as e:
        return {"error": str(e)}