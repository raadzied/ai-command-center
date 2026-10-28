#!/usr/bin/env python3
"""Quick diagnostic to isolate TTS pipeline issues."""
import asyncio
import sys

def test_edge_tts():
    """Test edge-tts synthesis only (no playback)."""
    import edge_tts
    
    async def synthesize():
        communicate = edge_tts.Communicate("مرحبا", voice="ar-SA-HamedNeural")
        audio_data = bytearray()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_data.extend(chunk["data"])
        return bytes(audio_data)
    
    print("[TEST] Synthesizing with edge-tts...")
    mp3_bytes = asyncio.run(synthesize())
    print(f"[OK] Got {len(mp3_bytes)} MP3 bytes")
    return mp3_bytes

def test_miniaudio_decode(mp3_bytes):
    """Test miniaudio decode only."""
    import miniaudio
    print("[TEST] Decoding MP3 with miniaudio...")
    decoded = miniaudio.decode(
        mp3_bytes,
        output_format=miniaudio.SampleFormat.SIGNED16,
        nchannels=1,
        sample_rate=24000
    )
    print(f"[OK] Decoded: rate={decoded.sample_rate}, samples_len={len(decoded.samples)}")
    return decoded

def test_numpy_convert(decoded):
    """Test numpy conversion."""
    import numpy as np
    print("[TEST] Converting PCM to numpy array...")
    pcm_array = np.frombuffer(decoded.samples, dtype=np.int16)
    print(f"[OK] Numpy array shape: {pcm_array.shape}")
    return pcm_array

def test_dsp(pcm_array):
    """Test warmth DSP filter."""
    import numpy as np
    from tts_streamer import TTSStreamer
    print("[TEST] Applying warmth DSP...")
    warm_pcm = TTSStreamer._apply_human_warmth_dsp(pcm_array, sample_rate=24000)
    print(f"[OK] DSP applied: {warm_pcm.shape}, min={warm_pcm.min()}, max={warm_pcm.max()}")
    return warm_pcm

def test_sounddevice_play(warm_pcm):
    """Test sounddevice playback."""
    import sounddevice as sd
    print("[TEST] Playing via sounddevice (blocking)...")
    try:
        sd.play(warm_pcm, samplerate=24000, blocking=True)
        print("[OK] Playback completed!")
    except Exception as e:
        print(f"[FAIL] Playback error: {e}")

if __name__ == "__main__":
    print("=" * 50)
    print("  TTS PIPELINE DIAGNOSTIC TEST")
    print("=" * 50)
    
    try:
        mp3_bytes = test_edge_tts()
        decoded = test_miniaudio_decode(mp3_bytes)
        pcm_array = test_numpy_convert(decoded)
        warm_pcm = test_dsp(pcm_array)
        test_sounddevice_play(warm_pcm)
        print("\n" + "=" * 50)
        print("  ALL DIAGNOSTIC TESTS PASSED!")
        print("=" * 50)
    except Exception as e:
        print(f"\n[CRITICAL FAILURE] {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
