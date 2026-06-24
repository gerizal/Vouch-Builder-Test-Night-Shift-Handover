from langdetect import detect, LangDetectException
from deep_translator import GoogleTranslator


def detect_language(text: str) -> str:
    try:
        return detect(text)
    except LangDetectException:
        return "en"


def translate_to_english(text: str) -> tuple[str, str]:
    """Returns (translated_text, source_lang)."""
    lang = detect_language(text)
    if lang == "en":
        return text, "en"
    try:
        translated = GoogleTranslator(source="auto", target="en").translate(text)
        return (translated or text), lang
    except Exception:
        return text, lang
