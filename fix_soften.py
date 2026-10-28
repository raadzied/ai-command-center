#!/usr/bin/env python3
import re

f = open("E:/ai-command-center/human_arabic_voice.py", "r", encoding="utf-8")
content = f.read()
f.close()

marker = "            return word\n\n    @classmethod\n    def _apply_sun_moon_rule"
soften_method = ("            return word\n\n"
    "    @classmethod\n"
    "    def _soften_mid_sentence(cls, vocalized: str, clean_word: str) -> str:\n"
    '        """Prevents robotic textbook stiffness by keeping Wasl natural."""\n'
    "        # Keep Ta Marbouta clear in mid-sentence (pronounced as Taa when connected)\n"
    '        if clean_word in ("هذه", "هذا", "إلى", "على", "ذهبت"):\n'
    "            return vocalized\n"
    "        # Replace heavy Damma/Kasra tanween in fast conversational flow with light single vowel\n"
    '        vocalized = vocalized.replace("ٌ", "ُ").replace("ٍ", "ِ")\n'
    "        return vocalized\n\n\n"
    "    @classmethod\n"
    "    def _apply_sun_moon_rule")

if marker in content:
    content = content.replace(marker, soften_method, 1)
    with open("E:/ai-command-center/human_arabic_voice.py", "w", encoding="utf-8") as f:
        f.write(content)
    print("Inserted successfully")
else:
    print("Marker not found")
    # Debug
    idx = content.find("return word\n\n    @classmethod\n    def _apply_sun_moon_rule")
    print(f"Found marker at index: {idx}")
    # Show context
    if idx > 0:
        print(repr(content[idx-20:idx+60]))