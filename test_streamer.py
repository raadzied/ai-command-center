#!/usr/bin/env python3
"""Quick test of TTSStreamer.speak_text() to find hang point."""
import sys
sys.path.insert(0, 'E:\\ai-command-center')

from tts_streamer import TTSStreamer, segment_arabic_text

print("Testing TTSStreamer...")
streamer = TTSStreamer(voice="ar-SA-HamedNeural")

# Test segmentation first
text = "مرحبا بك"
sentences = segment_arabic_text(text)
print(f"Sentences: {sentences}")

# Try speaking just one short word
print("Calling speak_text...")
try:
    streamer.speak_text("مرحبا")
    print("speak_text completed!")
except Exception as e:
    print(f"Error: {e}")
