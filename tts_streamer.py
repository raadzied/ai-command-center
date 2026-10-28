#!/usr/bin/env python3
"""
TTS Streamer - Real-time Arabic text-to-speech with edge-tts + miniaudio decode + sounddevice play.
Phase 2.5 Humanization: Smart tashkeel, dynamic prosody, warmth DSP, conversational phrasing.
"""

import asyncio
import sys
import threading
import queue
import re
from typing import Optional, Callable, List, Dict

# Ensure encoding is set for Windows
if sys.platform == "win32":
    import os
    os.environ["PYTHONIOENCODING"] = "utf-8"

try:
    import miniaudio
    MINIAUDIO_AVAILABLE = True
except ImportError:
    MINIAUDIO_AVAILABLE = False
    print("[WARN] miniaudio not installed. Install with: pip install miniaudio")

try:
    import edge_tts
    EDGE_TTS_AVAILABLE = True
except ImportError:
    EDGE_TTS_AVAILABLE = False
    print("[WARN] edge-tts not installed. Install with: pip install edge-tts")

try:
    import sounddevice as sd
    SOUNDDEVICE_AVAILABLE = True
except ImportError:
    SOUNDDEVICE_AVAILABLE = False
    print("[WARN] sounddevice not installed. Install with: pip install sounddevice")

try:
    import numpy as np
    NUMPY_AVAILABLE = True
except ImportError:
    NUMPY_AVAILABLE = False
    print("[WARN] numpy not installed. Install with: pip install numpy")

# ── Phase 2.5: Import Arabic Grammar Engine ───────────────────────
try:
    from arabic_grammar_engine import SmartTashkeelEngine, get_human_prosody
    GRAMMAR_ENGINE_AVAILABLE = True
except ImportError:
    GRAMMAR_ENGINE_AVAILABLE = False
    print("[WARN] arabic_grammar_engine not found. Using basic mode.")

ARABIC_VOICES = {
    "ar-SA-HamedNeural": "Male - Eloquent/Warm",
    "ar-YE-SalehNeural": "Male - Yemeni/Clear Fusha",
    "ar-EG-ShakirNeural": "Male - Deep/Resonant",
    "ar-SA-ZariyahNeural": "Female - Natural/Clear",
    "ar-YE-MaryamNeural": "Female - Yemeni/Warm",
}

# ── Phase 2.5: Baseline Human Conversational Profile ─────────────
DEFAULT_HUMAN_RATE = "+8%"
DEFAULT_HUMAN_PITCH = "-2Hz"


def _strip_diacritics(text: str) -> str:
    return re.sub(r"[\u064B-\u065F\u0670]", "", text)


def segment_arabic_text(text: str) -> List[str]:
    """Split Arabic text ONLY on full sentence boundaries (. ؟ ! \n)."""
    raw_sentences = re.split(r'(?<=[.؟!!\n])\s+', text.strip())
    sentences = []
    for s in raw_sentences:
        s = s.strip()
        if not s:
            continue
        if len(s) > 200:
            sub_parts = re.split(r'(?<=[،;])\s+', s)
            current_chunk = ""
            for part in sub_parts:
                if len(current_chunk) + len(part) < 200:
                    current_chunk += " " + part if current_chunk else part
                else:
                    if current_chunk:
                        sentences.append(current_chunk.strip())
                    current_chunk = part
            if current_chunk:
                sentences.append(current_chunk.strip())
        else:
            sentences.append(s)
    return sentences if sentences else [text]


class ArabicVoiceEngine:
    """Processes Arabic text for edge-tts native rate/pitch control."""

    def __init__(self, voice: str = "ar-SA-HamedNeural"):
        self.voice = voice
        # Initialize grammar engine if available
        if GRAMMAR_ENGINE_AVAILABLE:
            self.grammar_engine = SmartTashkeelEngine(conversational_mode=True)
        else:
            self.grammar_engine = None

    def process_sentence(self, sentence_text: str) -> Dict[str, str]:
        """Get prosody for a sentence using grammar engine or fallback rules."""
        if self.grammar_engine:
            # Use smart prosody classification
            prosody = self.grammar_engine.get_prosody_for_sentence(sentence_text)
            # Apply smart tashkeel before synthesis
            processed_text = self.grammar_engine.apply_smart_tashkeel(sentence_text)
            return {"rate": prosody["rate"], "pitch": prosody["pitch"], "text": processed_text}
        else:
            # Fallback: simple particle-based rate adjustment
            stripped = _strip_diacritics(sentence_text)
            if any(p in stripped for p in ["إن", "قد", "والله"]):
                return {"rate": "-3%", "pitch": DEFAULT_HUMAN_PITCH, "text": sentence_text}
            return {"rate": DEFAULT_HUMAN_RATE, "pitch": DEFAULT_HUMAN_PITCH, "text": sentence_text}


class TTSStreamer:
    """Real-time Arabic TTS using edge-tts + miniaudio.decode + sounddevice.play
    with producer-consumer pre-fetching and humanized prosody/DSP."""

    def __init__(self, voice: str = "ar-SA-HamedNeural"):
        self.voice = voice
        if self.voice not in ARABIC_VOICES:
            self.voice = list(ARABIC_VOICES.keys())[0]
        self._audio_queue = queue.Queue()
        self._is_running = False

    async def _synthesize_to_bytes(self, text: str, rate: str = "+8%", pitch: str = "-2Hz") -> bytes:
        """Synthesize text to MP3 bytes via edge-tts with native rate/pitch params."""
        if not EDGE_TTS_AVAILABLE:
            return b""
        try:
            communicate = edge_tts.Communicate(
                text=text, voice=self.voice, rate=rate, pitch=pitch
            )
            audio_data = bytearray()
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_data.extend(chunk["data"])
            return bytes(audio_data)
        except Exception as e:
            print("[WARN] edge-tts synthesis error: %s" % str(e))
            return b""

    def _producer_worker(self, sentences: List[str]):
        """Producer thread: synthesize all sentences into MP3 byte queue."""
        async def run_producers():
            for sentence in sentences:
                engine = ArabicVoiceEngine(voice=self.voice)
                prosody = engine.process_sentence(sentence)
                mp3_bytes = await self._synthesize_to_bytes(
                    text=prosody["text"],
                    rate=prosody["rate"],
                    pitch=prosody["pitch"]
                )
                if mp3_bytes:
                    self._audio_queue.put(mp3_bytes)
            self._audio_queue.put(None)

        try:
            asyncio.run(run_producers())
        except RuntimeError:
            loop = asyncio.get_event_loop()
            loop.run_until_complete(run_producers())

    @staticmethod
    def _apply_human_warmth_dsp(pcm_array: np.ndarray, sample_rate: int = 24000) -> np.ndarray:
        """Apply studio warmth DSP: normalize, soft low-pass warmth, soft tube saturation, 15ms fade.

        CRITICAL FIX: Uses normalized float32 [-1.0, 1.0] range BEFORE tanh,
        then scales back to int16 with proper clipping at 31500 headroom.
        """
        if len(pcm_array) == 0:
            return pcm_array

        # 1. Normalize int16 to float32 in range [-1.0, 1.0]
        pcm = pcm_array.astype(np.float32) / 32768.0

        # 2. Warmth filter (gentle high-frequency roll-off to remove metallic TTS edge)
        warmth = 0.80 * pcm + 0.20 * np.roll(pcm, 1)
        warmth[0] = pcm[0]

        # 3. Warm tube-style soft saturation (correctly scaled on normalized floats!)
        warmth = np.tanh(warmth * 1.15) / np.tanh(1.15)

        # 4. 15ms fade-in/out envelope to prevent speaker clicks
        fade_samples = int(0.015 * sample_rate)
        if len(warmth) > 2 * fade_samples:
            warmth[:fade_samples] *= np.linspace(0.0, 1.0, fade_samples, dtype=np.float32)
            warmth[-fade_samples:] *= np.linspace(1.0, 0.0, fade_samples, dtype=np.float32)

        # 5. Scale back to int16 safely with headroom
        return np.clip(warmth * 31500.0, -32768, 32767).astype(np.int16)

    def _play_mp3_bytes(self, mp3_bytes: bytes):
        """Decode MP3 bytes in RAM via miniaudio.decode, apply warmth DSP, play via sounddevice."""
        if not mp3_bytes or len(mp3_bytes) < 100:
            print("[WARN] Empty or invalid MP3 buffer!")
            return
        if not MINIAUDIO_AVAILABLE or not SOUNDDEVICE_AVAILABLE or not NUMPY_AVAILABLE:
            print("[WARN] Missing audio libraries (miniaudio/sounddevice/numpy)!")
            return
        try:
            # 1. Decode MP3 bytes in memory to signed 16-bit PCM
            decoded = miniaudio.decode(
                mp3_bytes,
                output_format=miniaudio.SampleFormat.SIGNED16,
                nchannels=1,
                sample_rate=24000
            )
            # 2. Convert raw PCM samples to a NumPy int16 array for sounddevice
            pcm_array = np.frombuffer(decoded.samples, dtype=np.int16)

            # 3. Apply Phase 2.5 Human Warmth DSP Filter
            warm_pcm = self._apply_human_warmth_dsp(pcm_array, sample_rate=decoded.sample_rate)

            # 4. Play through default Windows speakers, blocking until finished
            sd.play(warm_pcm, samplerate=decoded.sample_rate, blocking=True)
        except Exception as e:
            print("[WARN] miniaudio/sounddevice playback error: %s" % str(e))

    def _consumer_worker(self):
        """Consumer thread: pull MP3 bytes from queue and play sequentially."""
        while self._is_running:
            try:
                mp3_bytes = self._audio_queue.get(timeout=0.2)
                if mp3_bytes is None:
                    break
                self._play_mp3_bytes(mp3_bytes)
            except queue.Empty:
                continue
            except Exception as e:
                print("[WARN] Audio consumer error: %s" % str(e))

    def speak_text(self, text: str):
        """Main entry point: segment text, start producer, consume & play."""
        sentences = segment_arabic_text(text)
        if not sentences:
            return
        self._is_running = True
        producer_thread = threading.Thread(target=self._producer_worker, args=(sentences,), daemon=True)
        producer_thread.start()
        self._consumer_worker()
        producer_thread.join()

    def stop(self):
        self._is_running = False


if __name__ == "__main__":
    print("TTS Streamer loaded successfully (Phase 2.5 Humanized backend).")
