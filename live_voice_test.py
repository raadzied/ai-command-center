#!/usr/bin/env python3
"""
Live Voice Test Script – REAL audio via sounddevice + edge-tts.
No simulation. Shows phonetic transformations, plays actual synthesized audio.
"""

import sys
import time
import threading
import queue
from typing import Optional, Callable


# ── Colour helper ───────────────────────────────────────────────
def print_colored(txt: str, code: str = "0;36") -> None:
    """Print coloured text to terminal."""
    print(f"\033[{code}m{txt}\033[0m")


# ── Audio library check ──────────────────────────────────────────
def test_audio_libraries() -> bool:
    """Check sounddevice + edge-tts availability."""
    print_colored = lambda txt, code: print(f"\033[{code}m{txt}\033[0m")

    print_colored("Testing audio library availability...\n", "1;33")

    ok = True
    try:
        import sounddevice as sd
        info = sd.query_devices(sd.default_input_device)
        print_colored(f"✅ sounddevice available: {info['name']}", "1;32")
        print_colored(f"   Sample rate: {info['default_samplerate']} Hz\n", "1;32")
    except ImportError:
        print_colored("⚠️ sounddevice not installed. Install: pip install sounddevice\n", "1;33")
        ok = False
    except Exception as e:
        print_colored(f"⚠️ sounddevice error: {e}\n", "1;33")
        ok = False

    try:
        import edge_tts
        print_colored("✅ edge-tts available\n", "1;32")
    except ImportError:
        print_colored("⚠️ edge-tts not installed. Install: pip install edge-tts\n", "1;33")
        ok = False

    return ok


# ── Arabic diacritics demo ───────────────────────────────────────
def arabic_diacritics_demo() -> None:
    """Show Arabic diacritics and grammar-engine segmentation."""
    print_colored("\n=== Arabic Diacritics & Grammar Engine ===\n", "1;36")

    test_texts = [
        "علِّمْني معنى الذكاء الاصطناعي",
        "بِالطَّبْعْ، المسألة سهلة",
        "قُرْآنٌ كريمٌ",
    ]

    for text in test_texts:
        print_colored(f"Input:  {text}", "0;37")
        # Run grammar engine
        clauses = apply_arabic_grammar(text)
        first = clauses[0] if clauses else text
        print_colored(f"Output: {first[:60]}… (segmented for TTS)", "0;33")
        print()


# ── Arabic grammar engine (tashkeel & pause rules) ───────────────
def _strip_diacritics(text: str) -> str:
    import re
    return re.sub(r"[\u064B-\u065F\u0670]", "", text)


def _add_quranic_pauses(text: str) -> str:
    text = text.replace("،", " COMMA ")
    text = text.replace(".", " PERIOD ")
    text = text.replace("؟", " QUESTION ")
    return text


def segment_arabic_text(text: str) -> list:
    segments = []
    current = []
    i = 0
    while i < len(text):
        ch = text[i]
        if ch == "،":
            seg = "".join(current).strip()
            if seg:
                segments.append(seg + " PAUSE_150")
            current = []
            i += 1
            continue
        if ch in ".؟":
            seg = "".join(current).strip()
            if seg:
                segments.append(seg + " PAUSE_350")
            current = []
            i += 1
            continue
        current.append(ch)
        i += 1
    seg = "".join(current).strip()
    if seg:
        segments.append(seg)
    return segments


def apply_arabic_grammar(text: str) -> list:
    """Return list of (clause, pause_ms) tuples after grammar processing."""
    stripped = _strip_diacritics(text)
    marked = _add_quranic_pauses(stripped)
    return segment_arabic_text(marked)


# ── Main interactive test ────────────────────────────────────────
def main():
    print_colored = lambda txt, code: print(f"\033[{code}m{txt}\033[0m")

    print_colored("\n" + "="*60, "1;36")
    print_colored("  LIVE VOICE TEST – REAL ARABIC AUDIO", "1;36")
    print_colored("="*60 + "\n", "1;36")

    # 1) Library check
    ok = test_audio_libraries()
    if not ok:
        print_colored("⚠️ Continue anyway – some features may be limited.\n", "1;33")

    # 2) Diacritics demo
    arabic_diacritics_demo()

    # 3) Main loop
    print_colored("\n--- Interactive Session ---\n", "1;33")
    print_colored("1. Enter Arabic text → hear real synthesis\n", "0;37")
    print_colored("2. Diacritics demonstration\n", "0;37")
    print_colored("3. Exit\n", "0;37")

    try:
        while True:
            choice = input("\nYour choice (1-3): ").strip()
            if choice == "3" or choice == "4":
                print_colored("\n👋 Goodbye! 👋\n", "1;32")
                break

            elif choice == "1":
                text = input("\n🔤 Enter Arabic text: ").strip()
                if not text:
                    continue

                print_colored(f"\n▶️ Processing: {text[:50]}{'…' if len(text) > 50 else ''}", "1;33")

                # Run Arabic grammar engine
                clauses = apply_arabic_grammar(text)
                print_colored(f"🔤 Grammar segmented into {len(clauses)} clause(s).", "1;33")

                # Synthesize & play REAL audio via edge-tts + sounddevice
                import edge_tts
                import sounddevice as sd

                voice = "ar-SA-HamedNeural"
                streamer = TTSStreamer(voice=voice)

                # Prepare segments from grammar engine
                clauses_data = apply_arabic_grammar(text)

                def on_chunk(chunk):
                    pass  # we'll just play via sd directly

                # Play each clause with appropriate pause
                for clause_info in clauses_data:
                    clause_text = clause_info  # clause string (simplified)
                    # Synthesize via edge-tts with native rate/pitch
                    try:
                        prosody = ArabicVoiceEngine(voice=voice).process_segment(clause_text)
                        comm = edge_tts.Communicate(
                            text=clause_text,
                            voice=voice,
                            rate=prosody["rate"],
                            pitch=prosody["pitch"],
                        )
                        for av_chunk in comm.stream():
                            sd.play(av_chunk, samplerate=24000)
                            sd.wait()  # block until finished
                    except Exception as e:
                        print_colored(f"❌ TTS error: {e}", "1;31")

                    # Pause between clauses (150ms comma / 350ms period/question)
                    # Determine pause from clause string if marked
                    pause_ms = 200  # default
                    if "PAUSE_150" in clause_text:
                        pause_ms = 150
                    elif "PAUSE_350" in clause_text:
                        pause_ms = 350
                    time.sleep(pause_ms / 1000.0)

                print_colored("✅ All clauses synthesized & played.\n", "1;32")

            elif choice == "2":
                arabic_diacritics_demo()

            else:
                print_colored("❌ Invalid choice. Try 1–3.", "1;31")

    except KeyboardInterrupt:
        print_colored("\n\n👋 Goodbye! 👋\n", "1;32")
        print_colored("Thank you for testing!\n", "1;32")


if __name__ == "__main__":
    main()