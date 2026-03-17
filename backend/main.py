from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from transformers import pipeline
from PIL import Image
import librosa
import numpy as np
import io
import os
import tempfile
import traceback
import imageio_ffmpeg
import subprocess

app = FastAPI(title="Deepfake Detector Local API")

# Setup CORS for local testing
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print("Loading models... This might take a moment.")
image_pipeline = pipeline("image-classification", model="dima806/deepfake_vs_real_image_detection")
audio_pipeline = pipeline("audio-classification", model="MelodyMachine/Deepfake-audio-detection-V2")
print("All models loaded successfully!")


def parse_scores(results, mode="image"):
    """Extract real/fake scores from pipeline results."""
    print(f"[DEBUG] Raw {mode} results: {results}")
    real_score = 0.0
    fake_score = 0.0
    for res in results:
        label = res["label"].lower().strip()
        # Image model uses: "real", "fake"
        # Audio models may use: "bonafide"/"bona-fide" (real), "spoof" (fake)
        if label in ("real", "bonafide", "bona-fide", "bona fide"):
            real_score = res["score"]
        elif label in ("fake", "spoof", "deepfake"):
            fake_score = res["score"]
        else:
            print(f"[WARNING] Unknown label '{label}' with score {res['score']}")
    total = real_score + fake_score
    if total > 0:
        real_score /= total
        fake_score /= total
    return round(real_score * 100, 2), round(fake_score * 100, 2)


@app.post("/api/detect/image")
async def detect_image(file: UploadFile = File(...)):
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image.")
    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents)).convert("RGB")
        results = image_pipeline(image)
        real_conf, fake_conf = parse_scores(results)
        return JSONResponse(content={"real_confidence": real_conf, "fake_confidence": fake_conf})
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error processing image: {e}")


@app.post("/api/detect/audio")
async def detect_audio(file: UploadFile = File(...)):
    # Accept any file — browsers sometimes send audio as application/octet-stream
    try:
        contents = await file.read()

        # Save uploaded file to a temp location
        suffix = os.path.splitext(file.filename or ".wav")[1] or ".wav"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(contents)
            tmp_path = tmp.name

        # Conversion to WAV using ffmpeg directly (more robust than pydub/ffprobe)
        wav_path = tmp_path
        if suffix.lower() not in (".wav", ".flac"):
            wav_path = tmp_path + ".wav"
            ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
            print(f"[DEBUG] Converting {suffix} -> WAV using {ffmpeg_exe}")
            try:
                # Use ffmpeg directly to avoid ffprobe dependency
                subprocess.run([ffmpeg_exe, "-i", tmp_path, wav_path, "-y"], 
                               check=True, capture_output=True)
                os.unlink(tmp_path)
            except subprocess.CalledProcessError as e:
                print(f"[ERROR] FFmpeg failed: {e.stderr.decode()}")
                if os.path.exists(tmp_path): os.unlink(tmp_path)
                raise HTTPException(status_code=500, detail=f"Conversion failed: {e.stderr.decode()}")

        # Load audio with librosa (soundfile handles WAV natively)
        audio_array, sample_rate = librosa.load(wav_path, sr=16000, mono=True)
        os.unlink(wav_path)
        print(f"[DEBUG] Audio loaded: {len(audio_array)} samples at {sample_rate}Hz")

        # Pass raw numpy array + sample rate to the pipeline
        results = audio_pipeline({"raw": audio_array, "sampling_rate": sample_rate})

        real_conf, fake_conf = parse_scores(results, mode="audio")
        return JSONResponse(content={"real_confidence": real_conf, "fake_confidence": fake_conf})
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error processing audio: {e}")



# Mount the frontend directory
frontend_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
if os.path.isdir(frontend_path):
    app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")
