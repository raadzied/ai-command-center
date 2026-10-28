#!/usr/bin/env python3
"""
Arabic Phonetic & Prosody Training Lab
Interactive training and calibration system for Arabic pronunciation rules.
"""
import sys
import os
import json
import asyncio
import re

# Ensure UTF-8 output on Windows
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Add paths
sys.path.insert(0, r"E:\ai-command-center")

# Import the voice engine
try:
    from human_arabic_voice import HumanArabicVoiceEngine, EloquentArabicPhonetics
    ENGINE_AVAILABLE = True
except ImportError:
    ENGINE_AVAILABLE = False
    print("[WARN] human_arabic_voice not found. Running in text-only mode.")


class VoiceTrainerLab:
    """Interactive Arabic phonetic training and calibration lab."""

    def __init__(self, voice: str = "ar-SA-HamedNeural"):
        self.voice = voice
        self.engine = HumanArabicVoiceEngine("gulf_male") if ENGINE_AVAILABLE else None
        self.trained_rules = {}
        self.load_learned_phonetics()

    def load_learned_phonetics(self):
        """Load learned phonetics from JSON file."""
        json_path = r"E:\ai-command-center\learned_phonetics.json"
        if os.path.exists(json_path):
            try:
                with open(json_path, "r", encoding="utf-8") as f:
                    self.trained_rules = json.load(f)
                print("[OK] Loaded learned_phonetics.json (%d categories)" % len(self.trained_rules.get("exact_words", {})))
            except Exception as e:
                print("[WARN] Could not load learned_phonetics.json: %s" % str(e))
                self.trained_rules = {}
        else:
            print("[WARN] learned_phonetics.json not found. Using default rules.")
            self.trained_rules = {}

    def _safe_print(self, text):
        """Print text safely on Windows cp1256."""
        try:
            print(text)
        except UnicodeEncodeError:
            print(text.encode("utf-8", errors="replace").decode("cp1256", errors="replace"))

    def _print_header(self, title):
        self._safe_print("\n" + "=" * 60)
        self._safe_print("  " + title)
        self._safe_print("=" * 60 + "\n")

    def _print_result(self, original, processed, description=""):
        self._safe_print("  Original:  %s" % original)
        self._safe_print("  Processed: %s" % processed)
        if description:
            self._safe_print("  Rule:      %s" % description)
        self._safe_print("")

    def bench_1_sun_moon_letters(self):
        """Bench 1: Sun & Moon Letters (اللام الشمسية والقمرية)"""
        self._print_header("BENCH 1: Sun & Moon Letters (اللام الشمسية والقمرية)")

        test_words = [
            ("الشمس", "الشَّمسُ (Sun letter: ش -> Shadda)"),
            ("القمر", "الْقَمَرُ (Moon letter: ق -> Sukoon on Lam)"),
            ("النور", "النُّورُ (Sun letter: ن -> Shadda)"),
            ("الباب", "الْبَابُ (Moon letter: ب -> Sukoon on Lam)"),
            ("السماء", "السَّمَاءُ (Sun letter: س -> Shadda)"),
            ("الكتاب", "الْكِتَابُ (Moon letter: ك -> Sukoon on Lam)"),
            ("الرحمن", "الرَّحْمَنُ (Sun letter: ر -> Shadda)"),
            ("الهداية", "الْهِدَايَةُ (Moon letter: ه -> Sukoon on Lam)"),
        ]

        for word, description in test_words:
            result = EloquentArabicPhonetics.process_sentence(word) if ENGINE_AVAILABLE else word
            self._print_result(word, result, description)

        self._safe_print("  [INFO] Sun letters: ت ث د ذ ر ز س ش ص ض ط ظ ل ن")
        self._safe_print("  [INFO] Moon letters: ا ب ج ح خ ع غ ف ق ك م ه و ي")
        self._safe_print("  [RULE] Sun letter -> Shadda (ّ) on the sun letter")
        self._safe_print("  [RULE] Moon letter -> Sukoon (ْ) on the Lam")

    def bench_2_preposition_genitive(self):
        """Bench 2: Preposition Genitive Rule (قاعدة الجر)"""
        self._print_header("BENCH 2: Preposition Genitive Rule (قاعدة الجر)")

        test_pairs = [
            ("في المدرسة", "فِي الْمَدْرَسَةِ (Kasra on noun after في)"),
            ("من الله", "مِنَ اللَّهِ (Kasra on noun after من)"),
            ("إلى المدرسة", "إِلَى الْمَدْرَسَةِ (Kasra on noun after إلى)"),
            ("على المكتب", "عَلَى الْمَكْتَبِ (Kasra on noun after على)"),
            ("عن العلم", "عَنِ الْعِلْمِ (Kasra on noun after عن)"),
            ("بِالقلم", "بِالْقَلَمِ (Kasra on noun after بـ)"),
            ("لِلَّهِ", "لِلَّهِ (Kasra on noun after لـ)"),
            ("في البيت", "فِي الْبَيْتِ (Kasra on noun after في)"),
            ("من الباب", "مِنَ الْبَابِ (Kasra on noun after من)"),
            ("إلى الباب", "إِلَى الْبَابِ (Kasra on noun after إلى)"),
        ]

        for phrase, description in test_pairs:
            result = EloquentArabicPhonetics.process_sentence(phrase) if ENGINE_AVAILABLE else phrase
            self._print_result(phrase, result, description)

        self._safe_print("  [RULE] Preposition + Noun (not at pause) -> Kasra (ِ) on noun end")
        self._safe_print("  [RULE] Preposition + Noun (at pause) -> Waqf rules take precedence")

    def bench_3_inna_kana_rules(self):
        """Bench 3: Inna & Kana Rules (إنّ وكان)"""
        self._print_header("BENCH 3: Inna & Kana Rules (إنّ وكان)")

        test_pairs = [
            ("إن الله غفور", "إِنَّ اللَّهَ غَفُورٌ (Fatha after إنّ)"),
            ("إنك مجتهد", "إِنَّكَ مُجْتَهِدٌ (Fatha after إنّ)"),
            ("أنت طالب", "أَنْتَ طَالِبٌ (Fatha after إنّ)"),
            ("كان الله", "كَانَ اللَّهُ (Damma after كان)"),
            ("كان طالباً", "كَانَ طَالِباً (Damma after كان)"),
            ("أصبح الليل", "أَصْبَحَ اللَّيْلُ (Damma after أصبح)"),
            ("أصبح الطالب", "أَصْبَحَ الطَّالِبُ (Damma after أصبح)"),
            ("ظلّ الطالب", "ظَلَّ الطَّالِبُ (Damma after ظلّ)"),
            ("ظلّ مجتهداً", "ظَلَّ مُجْتَهِداً (Damma after ظلّ)"),
        ]

        for phrase, description in test_pairs:
            result = EloquentArabicPhonetics.process_sentence(phrase) if ENGINE_AVAILABLE else phrase
            self._print_result(phrase, result, description)

        self._safe_print("  [RULE] Inna particles (إنّ/أنّ/لعلّ/لكنّ) -> Fatha (َ) on following noun")
        self._safe_print("  [RULE] Kana verbs (كان/أصبح/ظلّ) -> Damma (ُ) on following noun")

    def bench_4_waqf_wasl(self):
        """Bench 4: Waqf vs. Wasl Perfection"""
        self._print_header("BENCH 4: Waqf vs. Wasl Perfection")

        test_pairs = [
            ("هذه طالبة مجتهدة", "هَذِهِ طَالِبَةٌ مُجْتَهِدَةٌ (Waqf: ة -> soft هْ)"),
            ("هذه طالبة، وهذا طالب", "هَذِهِ طَالِبَةٌ، وهذا طَالِبٌ (Waqf at comma)"),
            ("ذهبت فاطمة إلى المدرسة", "ذَهَبَتْ فَاطِمَةُ إِلَى الْمَدْرَسَةِ (Waqf at end)"),
            ("أنت طالب", "أَنْتَ طَالِبٌ (Wasl: Ta Marbouta as Taa)"),
            ("أنت طالبة", "أَنْتِ طَالِبَةٌ (Wasl: Ta Marbouta as Taa)"),
            ("ذاهب", "ذَاهِبٌ (Wasl: Ta Marbouta as Taa)"),
            ("ذاهبة", "ذَاهِبَةٌ (Wasl: Ta Marbouta as Taa)"),
            ("المدرسة الجميلة", "الْمَدْرَسَةِ الْجَمِيلَةِ (Wasl: full tashkeel)"),
            ("الطالبة الجميلة", "الْطَّالِبَةِ الْجَمِيلَةِ (Wasl: full tashkeel)"),
        ]

        for phrase, description in test_pairs:
            result = EloquentArabicPhonetics.process_sentence(phrase) if ENGINE_AVAILABLE else phrase
            self._print_result(phrase, result, description)

        self._safe_print("  [RULE] At pause (comma/period): Ta Marbouta (ة) -> soft Haa (هْ)")
        self._safe_print("  [RULE] In mid-sentence: Ta Marbouta (ة) -> pronounced as Taa (ت)")
        self._safe_print("  [RULE] At pause: strip final case vowels/tanween, add Sukoon (ْ)")
        self._safe_print("  [RULE] In mid-sentence: soften heavy tanween to single vowel")

    def bench_5_conversational_fillers(self):
        """Bench 5: Conversational Fillers & Prosody"""
        self._print_header("BENCH 5: Conversational Fillers & Prosody")

        test_phrases = [
            ("طب", "طَيِّبْ (Filler: warm, natural pitch)"),
            ("حسناً", "حَسَناً (Filler: thoughtful, deliberate)"),
            ("بكل سرور", "بِكُلِّ سُرُورْ (Filler: agreement, warm)"),
            ("أهلاً بك", "أَهْلاً بِكَ (Greeting: warm, inviting)"),
            ("هل تلاحظ", "هل تلاحظ (Question: engaging, rising pitch)"),
            ("في الواقع", "في الواقع (Clarification: thoughtful)"),
            ("دعنا نرى", "دعنا نرى (Thinking: deliberate)"),
        ]

        for phrase, description in test_phrases:
            result = EloquentArabicPhonetics.process_sentence(phrase) if ENGINE_AVAILABLE else phrase
            self._print_result(phrase, result, description)

        self._safe_print("  [PROSODY] Greeting: rate=+7%, pitch=-1Hz")
        self._safe_print("  [PROSODY] Question: rate=+6%, pitch=+2Hz")
        self._safe_print("  [PROSODY] Thoughtful: rate=+4%, pitch=-3Hz")
        self._safe_print("  [PROSODY] Body/Default: rate=+9%, pitch=-2Hz")

    def bench_6_sanani_dialect_ab_benchmark(self):
        """Bench 6: San'ani Dialect A/B Benchmark"""
        self._print_header("BENCH 6: San'ani Dialect A/B Benchmark")

        sanani_dialogues = [
            "حيا بك يا خبير، كيف حالك وكيف الأمور عندك؟ قول لي بس ما تشتي، وأنا أسبّر لك النظام ذلحين على عيني وراسي.",
            "شوف يا صاحبي، البرنامج هذا مليح قوي وسريع في الشغل، بس نشتي نضبط الصوت عشان يطلع الكلام واضح ومسبّر.",
            "ما هو الخبر اليوم؟ لمه الصوت الأول كان يتكلم هكذا؟ ذلحين اسمع كيف تغيرت النبرة وصارت أقرب لكلامنا."
        ]

        # Create samples directory
        samples_dir = os.path.join("E:", "Arabc sound", "arabic_voice_engine", "sanani_samples")
        os.makedirs(samples_dir, exist_ok=True)

        # Check for Gemini API key
        gemini_api_key = os.environ.get("GEMINI_API_KEY", "")

        self._safe_print("  Testing 3 San'ani dialogues across 3 providers:\n")

        for idx, dialogue in enumerate(sanani_dialogues, 1):
            self._safe_print("\n  --- Dialogue %d ---" % idx)
            self._safe_print("  Text: %s" % (dialogue[:80] + ("..." if len(dialogue) > 80 else "")))

            # Test A: ar-YE-SalehNeural with Fusha OFF & sanani_mode=True
            self._safe_print("\n  [Test A] ar-YE-SalehNeural (sanani_mode=True, rate=+7%, pitch=-1Hz)")
            if ENGINE_AVAILABLE:
                engine_a = HumanArabicVoiceEngine("yemeni_male", sanani_mode=True)
                engine_a.voice = "ar-YE-SalehNeural"
                processed = EloquentArabicPhonetics.process_sentence(dialogue, sanani_mode=True)
                self._safe_print("    Phonetic: %s" % processed[:120])
                try:
                    asyncio.run(engine_a.speak(dialogue, sanani_mode=True))
                except Exception as e:
                    self._safe_print("    Error: %s" % str(e))

            # Test B: ar-YE-MaryamNeural with sanani_mode=True
            self._safe_print("\n  [Test B] ar-YE-MaryamNeural (sanani_mode=True, rate=+6%, pitch=+0Hz)")
            if ENGINE_AVAILABLE:
                engine_b = HumanArabicVoiceEngine("yemeni_female", sanani_mode=True)
                engine_b.voice = "ar-YE-MaryamNeural"
                processed = EloquentArabicPhonetics.process_sentence(dialogue, sanani_mode=True)
                self._safe_print("    Phonetic: %s" % processed[:120])
                try:
                    asyncio.run(engine_b.speak(dialogue, sanani_mode=True))
                except Exception as e:
                    self._safe_print("    Error: %s" % str(e))

            # Test C: Gemini Native Audio API (if available)
            if gemini_api_key:
                self._safe_print("\n  [Test C] Gemini Native Audio API (sanani_mode=True)")
                try:
                    import google.generativeai as genai
                    genai.configure(api_key=gemini_api_key)
                    model = genai.GenerativeModel("gemini-2.0-flash-exp")
                    response = model.generate_content(
                        "You are a San'ani Yemeni Arabic speaker. Speak naturally in San'ani dialect. "
                        "Use words like تشتي، ذلحين، ماشتي، مليح، قوي، صاحبي. "
                        "Do not use Fusha case endings. "
                        "Respond to this text naturally: %s" % dialogue
                    )
                    self._safe_print("    Gemini response: %s" % (response.text[:100] if response.text else "No response"))
                except ImportError:
                    self._safe_print("    [SKIP] google-generativeai not installed")
                except Exception as e:
                    self._safe_print("    [ERROR] Gemini API: %s" % str(e))
            else:
                self._safe_print("\n  [Test C] Gemini Native Audio API - SKIPPED (no GEMINI_API_KEY)")

        self._safe_print("\n  [INFO] San'ani phonetic processing applied:")
        self._safe_print("  [INFO] - Disabled Fusha I'rab (case endings stripped)")
        self._safe_print("  [INFO] - Forced Sukoon endings on all words")
        self._safe_print("  [INFO] - San'ani lexicon loaded from learned_phonetics.json")
        self._safe_print("  [INFO] - Sun/Moon letters still applied")
        self._safe_print("  [INFO] - San'ani bigrams applied (ما تشتي، كيف حالك، etc.)")

        self._safe_print("\n  [RULE] San'ani mode: Sukoon on endings, no Tanween, no Kasra/Damma case vowels")
        self._safe_print("  [RULE] San'ani bigrams override Fusha preposition genitive rules")

        # Save sample info
        sample_info_path = os.path.join(samples_dir, "sanani_bench_info.txt")
        with open(sample_info_path, "w", encoding="utf-8") as f:
            f.write("San'ani Dialect A/B Benchmark - Bench 6\n")
            f.write("=" * 50 + "\n\n")
            for idx, dialogue in enumerate(sanani_dialogues, 1):
                f.write("Dialogue %d:\n" % idx)
                f.write(dialogue + "\n\n")
                processed = EloquentArabicPhonetics.process_sentence(dialogue, sanani_mode=True)
                f.write("Phonetic output (sanani_mode):\n")
                f.write(processed + "\n\n")
                f.write("-" * 50 + "\n\n")
        self._safe_print("  [INFO] Sample info saved to: %s" % sample_info_path)

    def run_all_benches(self):
        """Run all training benches sequentially."""
        self._print_header("ARABIC PHONETIC & PROSODY TRAINING LAB")
        self._safe_print("  Running all 6 training benches...\n")

        self.bench_1_sun_moon_letters()
        self.bench_2_preposition_genitive()
        self.bench_3_inna_kana_rules()
        self.bench_4_waqf_wasl()
        self.bench_5_conversational_fillers()
        self.bench_6_sanani_dialect_ab_benchmark()

        self._safe_print("\n" + "=" * 60)
        self._safe_print("  ALL BENCHES COMPLETE")
        self._safe_print("=" * 60 + "\n")

    def interactive_menu(self):
        """Interactive menu for selecting training benches."""
        while True:
            self._print_header("ARABIC PHONETIC & PROSODY TRAINING LAB")
            self._safe_print("  Select a training bench:")
            self._safe_print("  1. Sun & Moon Letters (اللام الشمسية والقمرية)")
            self._safe_print("  2. Preposition Genitive Rule (قاعدة الجر)")
            self._safe_print("  3. Inna & Kana Rules (إنّ وكان)")
            self._safe_print("  4. Waqf vs. Wasl Perfection")
            self._safe_print("  5. Conversational Fillers & Prosody")
            self._safe_print("  6. San'ani Dialect A/B Benchmark")
            self._safe_print("  7. Run All Benches")
            self._safe_print("  8. Test Custom Text (Fusha)")
            self._safe_print("  9. Test Custom Text (San'ani)")
            self._safe_print("  10. Exit")

            choice = input("\n  Choice (1-10): ").strip()

            if choice == "1":
                self.bench_1_sun_moon_letters()
            elif choice == "2":
                self.bench_2_preposition_genitive()
            elif choice == "3":
                self.bench_3_inna_kana_rules()
            elif choice == "4":
                self.bench_4_waqf_wasl()
            elif choice == "5":
                self.bench_5_conversational_fillers()
            elif choice == "6":
                self.bench_6_sanani_dialect_ab_benchmark()
            elif choice == "7":
                self.run_all_benches()
            elif choice == "8":
                text = input("\n  Enter Arabic text to test (Fusha): ").strip()
                if text:
                    result = EloquentArabicPhonetics.process_sentence(text) if ENGINE_AVAILABLE else text
                    self._print_result(text, result, "Custom text test (Fusha)")
            elif choice == "9":
                text = input("\n  Enter Arabic text to test (San'ani): ").strip()
                if text:
                    result = EloquentArabicPhonetics.process_sentence(text, sanani_mode=True) if ENGINE_AVAILABLE else text
                    self._print_result(text, result, "Custom text test (San'ani)")
            elif choice == "10":
                self._safe_print("\n  Goodbye!\n")
                break
            else:
                self._safe_print("  Invalid choice. Try 1-10.")


if __name__ == "__main__":
    lab = VoiceTrainerLab()
    lab.interactive_menu()
