"""
Инвентар на очаквани източници (FIPAV/CEV) и приоритет на вълните.
Админът може да регистрира същите файлове в CMS; тук е референтният каталог.
"""

from typing import TypedDict


class MaterialEntry(TypedDict):
    key: str
    filename_hint: str
    content_type: str
    age_band: str
    language: str
    wave: int
    notes: str


MATERIAL_INVENTORY: list[MaterialEntry] = [
    {
        "key": "meso_4w_xls",
        "filename_hint": "Programmazione-Macrociclo-4-Settimane.xls",
        "content_type": "periodization",
        "age_band": "all",
        "language": "it",
        "wave": 1,
        "notes": "Структуриран мезоцикъл 4 седмици — приоритет за JSON шаблон",
    },
    {
        "key": "season_u16",
        "filename_hint": "Allenamento-U16-1pp.pdf",
        "content_type": "periodization",
        "age_band": "U16",
        "language": "it",
        "wave": 1,
        "notes": "Сезонна програма U16",
    },
    {
        "key": "org_training",
        "filename_hint": "Organizzazione dell'allenamento.pdf",
        "content_type": "organization",
        "age_band": "all",
        "language": "it",
        "wave": 1,
        "notes": "Организация на тренировката — методична статия",
    },
    {
        "key": "guide_fipav",
        "filename_hint": "GUIDA FIPAV 2024-2028",
        "content_type": "methodology",
        "age_band": "all",
        "language": "it",
        "wave": 1,
        "notes": "Принципи и рамка 2024–2028",
    },
    {
        "key": "global_drills",
        "filename_hint": "Esercitazioni-globali",
        "content_type": "exercise",
        "age_band": "all",
        "language": "it",
        "wave": 2,
        "notes": "Глобални упражнения — партидно в drills",
    },
    {
        "key": "course_u13_zip",
        "filename_hint": "corso U13.zip",
        "content_type": "course",
        "age_band": "U13",
        "language": "it",
        "wave": 2,
        "notes": "Курс U13 модул",
    },
    {
        "key": "course_u14_zip",
        "filename_hint": "corso U14.zip",
        "content_type": "course",
        "age_band": "U14",
        "language": "it",
        "wave": 2,
        "notes": "Курс U14 модул",
    },
    {
        "key": "cev_program",
        "filename_hint": "CEV program PDF",
        "content_type": "methodology",
        "age_band": "U18",
        "language": "it",
        "wave": 2,
        "notes": "CEV програма — допълнителна методика",
    },
]
