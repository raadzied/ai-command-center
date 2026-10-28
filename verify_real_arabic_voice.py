#!/usr/bin/env python3
"""
Verify Real Arabic Voice (Phase 2.5 Humanized) - Tests smooth, warm, natural-sounding
Arabic TTS with dynamic prosody, warmth DSP, and conversational phrasing.
"""

import asyncio
import os
import sys

try:
    import edge_tts
    import miniaudio
except ImportError as e:
    print("Missing required library: %s" % str(e))
    print("Please install: pip install edge-tts miniaudio")
    sys.exit(1)

from tts_streamer import TTSStreamer, segment_arabic_text


# ── Natural Conversational Dialogue (Warm, Human-Styled) ────────────────
CONVERSATIONAL_DIALOGUE = (
    "حسناً... دعنا نرى، أهلاً بك في مركز قيادة الذكاء الاصطناعي! "
    "بكل سرور، أنا هنا لمساعدتك على إنجاز مهامك البرمجية والإدارية بكل سهولة. "
    "في الواقع، النظام مصمم ليعمل معك كشريك ذكي حقيقي وليس مجرد أداة صمّاء. "
    "هل أنت مستعد لنبدأ مغامرة جديدة في عالم البرمجة والابتكار؟"
)

# Alternative dialogue for variety
ALTERNATIVE_DIALOGUE = (
    "أهلاً وسهلاً! يسعدني أن أكون مساعدك الشخصي اليوم. "
    "يمكنني أن أساعدك في كتابة الأكواد، تحليل البيانات، أو حتى تصميم واجهات المستخدم. "
    "دعنا نبدأ بأول مهمة - ما الذي تود إنجازه الآن؟"
)


def _safe_print(text):
    """Print text safely on Windows cp1256 by encoding to UTF-8 then decoding."""
    try:
        print(text)
    except UnicodeEncodeError:
        print(text.encode("utf-8", errors="replace").decode("cp1256", errors="replace"))


async def main():
    print("==================================================")
    print("  VERIFY PHASE 2.5 HUMANIZED ARABIC VOICE")
    print("  Smart Tashkeel + Dynamic Prosody + Warmth DSP")
    print("==================================================")

    # Display original text safely
    try:
        print("\nOriginal Conversational Text:\n" + CONVERSATIONAL_DIALOGUE + "\n")
    except UnicodeEncodeError:
        print("\nOriginal Conversational Text:\n" +
              CONVERSATIONAL_DIALOGUE.encode("utf-8", errors="replace").decode("cp1256", errors="replace") + "\n")

    sentences = segment_arabic_text(CONVERSATIONAL_DIALOGUE)
    print("Segmented into %d sentence(s):" % len(sentences))
    for idx, s in enumerate(sentences, 1):
        try:
            print("  %d. %s" % (idx, s[:80] + ("..." if len(s) > 80 else "")))
        except UnicodeEncodeError:
            safe_s = s[:80].encode("utf-8", errors="replace").decode("cp1256", errors="replace")
            print("  %d. %s" % (idx, safe_s))

    # ── Test Voice 1: Male Eloquent/Warm ─────────────────────────
    print("\n--- [Voice 1/3] Testing ar-SA-HamedNeural (Male - Eloquent/Warm) ---")
    streamer_hamed = TTSStreamer(voice="ar-SA-HamedNeural")
    streamer_hamed.speak_text(CONVERSATIONAL_DIALOGUE)

    await asyncio.sleep(0.3)

    # ── Test Voice 2: Male Yemeni/Clear Fusha ───────────────────
    print("\n--- [Voice 2/3] Testing ar-YE-SalehNeural (Male - Yemeni/Clear Fusha) ---")
    streamer_saleh = TTSStreamer(voice="ar-YE-SalehNeural")
    streamer_saleh.speak_text(ALTERNATIVE_DIALOGUE)

    await asyncio.sleep(0.3)

    # ── Test Voice 3: Female Natural/Clear ──────────────────────
    print("\n--- [Voice 3/3] Testing ar-SA-ZariyahNeural (Female - Natural/Clear) ---")
    streamer_zariyah = TTSStreamer(voice="ar-SA-ZariyahNeural")
    streamer_zariyah.speak_text(CONVERSATIONAL_DIALOGUE)

    print("\n==================================================")
    print("  VERIFICATION COMPLETE - HUMANIZED AUDIO")
    print("  Features Applied:")
    print("  - Smart Conversational Tashkeel")
    print("  - Dynamic Prosody (+6% to +10%, -4Hz to +2Hz)")
    print("  - Warmth DSP Filter (soft low-pass + tube saturation)")
    print("  - 15ms Fade Envelope (zero clicks)")
    print("  - Conversational Transitions")
    print("==================================================")


if __name__ == "__main__":
    asyncio.run(main())
