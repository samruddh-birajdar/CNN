import base64
import os
import tempfile
import urllib.request
from pathlib import Path
import cv2
import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from tensorflow.keras.models import load_model

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_MODEL_PATH = BASE_DIR / "models" / "Final_Crack_Detection_Model.keras"
MODEL_PATH = Path(os.getenv("MODEL_PATH", str(DEFAULT_MODEL_PATH)))
MODEL_URL = os.getenv("MODEL_URL", "").strip()


def ensure_model_file(model_path: Path, model_url: str) -> Path:
    if model_path.exists() and model_path.stat().st_size > 0:
        return model_path

    if not model_url:
        raise FileNotFoundError(
            f"Model file not found at {model_path} and MODEL_URL is not set."
        )

    model_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=model_path.parent, delete=False) as tmp:
        tmp_path = Path(tmp.name)

    try:
        urllib.request.urlretrieve(model_url, tmp_path)
        if tmp_path.stat().st_size == 0:
            raise ValueError("Downloaded model file is empty.")
        tmp_path.replace(model_path)
    except Exception:
        tmp_path.unlink(missing_ok=True)
        raise

    return model_path


resolved_model_path = ensure_model_file(MODEL_PATH, MODEL_URL)
model = load_model(resolved_model_path)
print(f"Model loaded successfully from: {resolved_model_path}")


def predict_frame(frame: np.ndarray, threshold: float = 0.5) -> tuple[str, float]:
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    x = cv2.resize(rgb, (128, 128)).astype(np.float32) / 255.0
    x = np.expand_dims(x, axis=0)

    pred = float(model.predict(x, verbose=0)[0][0])
    if pred > threshold:
        return "No Crack", pred
    return "Crack Detected", 1.0 - pred


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": model is not None}


@app.websocket("/ws/crack")
async def crack_websocket(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_json()
            base64_str = data.get("image") or ""
            threshold = float(data.get("threshold", 0.5))

            try:
                raw_b64 = base64_str.split(",", 1)[1] if "," in base64_str else base64_str
                img_bytes = base64.b64decode(raw_b64)
                frame = cv2.imdecode(np.frombuffer(img_bytes, np.uint8), cv2.IMREAD_COLOR)
                if frame is None:
                    await websocket.send_text("Error: Could not decode frame")
                    continue

                label, conf = predict_frame(frame, threshold=threshold)
                await websocket.send_text(f"{label} ({conf * 100:.1f}%)")
            except Exception as e:
                await websocket.send_text(f"Error: {e}")
    except WebSocketDisconnect:
        print("Client disconnected")


@app.post("/api/predict-upload")
async def predict_upload(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        nparr = np.frombuffer(contents, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if frame is None:
            return {"error": "Could not decode image"}

        label, conf = predict_frame(frame, threshold=0.5)
        return {
            "label": label,
            "confidence": round(conf * 100, 2),
        }
    except Exception as e:
        return {"error": str(e)}