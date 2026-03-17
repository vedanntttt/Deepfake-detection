"""
Test the audio deepfake model with different inputs to diagnose accuracy issues.
"""
import librosa
import numpy as np
from transformers import pipeline

print("Loading model...")
p = pipeline("audio-classification", model="MelodyMachine/Deepfake-audio-detection-V2")
print("Model loaded!")

# Test 1: Windows system sound (synthesized - should be "fake")
print("\n--- Test 1: Windows system sound (tada.wav) ---")
y, sr = librosa.load("C:/Windows/Media/tada.wav", sr=16000, mono=True)
print(f"  Duration: {len(y)/sr:.2f}s, Samples: {len(y)}")
result = p({"raw": y, "sampling_rate": sr})
print(f"  Result: {result}")

# Test 2: Very short synthetic tone (should be "fake")
print("\n--- Test 2: Pure synthetic sine wave (2s) ---")
t = np.linspace(0, 2, 2*16000, dtype=np.float32)
sine_wave = 0.5 * np.sin(2 * np.pi * 440 * t)
print(f"  Duration: {len(sine_wave)/16000:.2f}s")
result = p({"raw": sine_wave, "sampling_rate": 16000})
print(f"  Result: {result}")

# Test 3: White noise (2s)
print("\n--- Test 3: White noise (2s) ---")
noise = np.random.randn(2*16000).astype(np.float32) * 0.1
result = p({"raw": noise, "sampling_rate": 16000})
print(f"  Result: {result}")

# Test 4: Silence (2s)
print("\n--- Test 4: Silence (2s) ---")
silence = np.zeros(2*16000, dtype=np.float32)
result = p({"raw": silence, "sampling_rate": 16000})
print(f"  Result: {result}")

# Test 5: Check what labels the model config has
from transformers import AutoConfig
config = AutoConfig.from_pretrained("MelodyMachine/Deepfake-audio-detection-V2")
print(f"\n--- Model Config ---")
print(f"  id2label: {config.id2label}")
print(f"  label2id: {config.label2id}")

print("\nDone!")
