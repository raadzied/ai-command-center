#!/usr/bin/env python3
f = open("E:/ai-command-center/human_arabic_voice.py", "r", encoding="utf-8")
content = f.read()
f.close()

old = '''    async def speak(self, paragraph: str):
        # Split only on full sentence boundaries (. ؟ ! \\n), keeping commas inside for natural breath
        sentences = [
            s.strip()
            for s in re.split(r"(?<=[.؟!\\n])\\s+", paragraph.strip())
            if s.strip()
        ]'''

new = '''    async def speak(self, paragraph: str, sanani_mode: bool = None):
        if sanani_mode is None:
            sanani_mode = self.sanani_mode
        # Split only on full sentence boundaries (. ؟ ! \\n), keeping commas inside for natural breath
        sentences = [
            s.strip()
            for s in re.split(r"(?<=[.؟!\\n])\\s+", paragraph.strip())
            if s.strip()
        ]'''

if old in content:
    content = content.replace(old, new, 1)
    
    # Also update the process_sentence call inside speak
    old2 = "            eloquent_sent = EloquentArabicPhonetics.process_sentence(raw_sent)"
    new2 = "            eloquent_sent = EloquentArabicPhonetics.process_sentence(raw_sent, sanani_mode=sanani_mode)"
    if old2 in content:
        content = content.replace(old2, new2, 1)
    
    with open("E:/ai-command-center/human_arabic_voice.py", "w", encoding="utf-8") as f:
        f.write(content)
    print("Updated successfully")
else:
    print("Pattern not found")
    # Try to find it
    idx = content.find("async def speak")
    print(repr(content[idx:idx+200]))