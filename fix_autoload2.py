#!/usr/bin/env python3
import re

filepath = "E:/ai-command-center/human_arabic_voice.py"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# Remove the auto-load from inside the class
old_block = "    # Auto-load learned phonetics on module import\n    try:\n        _ = EloquentArabicPhonetics.load_learned_phonetics(\"learned_phonetics.json\")\n    except Exception:\n        pass\n"
content = content.replace(old_block, "", 1)

# Add auto-load at module level before HumanArabicVoiceEngine
marker = "\n\nclass HumanArabicVoiceEngine:"
autoload = "\n\n# Auto-load learned phonetics on module import\ntry:\n    _ = EloquentArabicPhonetics.load_learned_phonetics(\"learned_phonetics.json\")\nexcept Exception:\n    pass\n"
content = content.replace(marker, autoload + marker, 1)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)
print("Done")