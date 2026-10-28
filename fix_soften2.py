#!/usr/bin/env python3
f = open("E:/ai-command-center/human_arabic_voice.py", "r", encoding="utf-8")
content = f.read()
f.close()

# Find the end of _apply_waqf_rule method (before _apply_sun_moon_rule)
marker = "  return word\n\n\n    @classmethod\n    def _apply_sun_moon_rule"
soften_method = """  return word


    @classmethod
    def _soften_mid_sentence(cls, vocalized: str, clean_word: str) -> str:
        \"\"\"Prevents robotic textbook stiffness by keeping Wasl natural.\"\"\"
        # Keep Ta Marbouta clear in mid-sentence (pronounced as Taa when connected)
        if clean_word in ("هذه", "هذا", "إلى", "على", "ذهبت"):
            return vocalized
        # Replace heavy Damma/Kasra tanween in fast conversational flow with light single vowel
        vocalized = vocalized.replace("ٌ", "ُ").replace("ٍ", "ِ")
        return vocalized


    @classmethod
    def _apply_sun_moon_rule"""

if marker in content:
    content = content.replace(marker, soften_method, 1)
    with open("E:/ai-command-center/human_arabic_voice.py", "w", encoding="utf-8") as f:
        f.write(content)
    print("Inserted successfully")
else:
    print("Marker not found")
    # Debug
    idx = content.find("_apply_sun_moon_rule")
    print(f"sun_moon at: {idx}")
    print(repr(content[idx-60:idx+20]))