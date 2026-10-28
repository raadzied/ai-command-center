#!/usr/bin/env python3
"""Focused Phase 2.5 Humanization Test - Single voice, quick verification."""
import asyncio
import sys

from tts_streamer import TTSStreamer, segment_arabic_text


# Short conversational text for quick test
QUICK_TEST_TEXT = "حسناً، دعنا نرى كيف يعمل النظام الجديد."


def _safe_print(text):
    """Print text safely on Windows cp1256."""
    try:
        print(text)
    except UnicodeEncodeError:
        print(text.encode("utf-8", errors="replace").decode("cp1256", errors="replace"))


async def main():
    print("=" * 50)
    print("  PHASE 2.5 HUMANIZATION QUICK TEST")
    print("=" * 50)

    _safe_print("\nTest Text:\n" + QUICK_TEST_TEXT + "\n")

    sentences = segment_arabic_text(QUICK_TEST_TEXT)
    print("Segmented into %d sentence(s)" % len(sentences))

    print("\n--- Testing ar-SA-HamedNeural (Humanized) ---")
    streamer = TTSStreamer(voice="ar-SA-HamedNeural")
    streamer.speak_text(QUICK_TEST_TEXT)

    print("\nQuick humanization test complete!")


if __name__ == "__main__":
    asyncio.run(main())
