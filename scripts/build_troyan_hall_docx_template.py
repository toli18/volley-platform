#!/usr/bin/env python3
"""Build Appendix 12 DOCX blank matching the municipality form (fonts/bold/gerb/layout).

Source of truth: official blank text extract + WPS screenshot (Times New Roman 14,
gerb left of ОБЩИНА ТРОЯН, bold titles, italic field hints).

Run: python3 scripts/build_troyan_hall_docx_template.py
"""
from __future__ import annotations

from pathlib import Path

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING, WD_TAB_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, Twips


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "backend" / "app" / "static" / "troyan-hall" / "prilozhenie-12.docx"
LOGO = ROOT / "backend" / "app" / "static" / "troyan-hall" / "obshtina-troyan-logo.png"

FONT = "Times New Roman"
BODY = 12
HINT = 9
SMALL = 10
TITLE = 14
TABLE = 9


def _font(run, *, size=BODY, bold=False, italic=False, name=FONT):
    run.font.name = name
    run._element.rPr.rFonts.set(qn("w:ascii"), name)
    run._element.rPr.rFonts.set(qn("w:hAnsi"), name)
    run._element.rPr.rFonts.set(qn("w:cs"), name)
    run._element.rPr.rFonts.set(qn("w:eastAsia"), name)
    run.font.size = Pt(size)
    run.bold = bold
    run.italic = italic


def _pf(p, *, after=2, before=0, align=None, line=1.0):
    pf = p.paragraph_format
    pf.space_before = Pt(before)
    pf.space_after = Pt(after)
    pf.line_spacing = line
    if align is not None:
        p.alignment = align


def _p(doc_or_cell, text="", *, size=BODY, bold=False, italic=False, align=None, after=2, before=0):
    if hasattr(doc_or_cell, "add_paragraph"):
        p = doc_or_cell.add_paragraph()
    else:
        p = doc_or_cell.paragraphs[0]
    _pf(p, after=after, before=before, align=align)
    if text:
        r = p.add_run(text)
        _font(r, size=size, bold=bold, italic=italic)
    return p


def _runs(p, parts):
    """parts: (text, size, bold, italic)"""
    for text, size, bold, italic in parts:
        r = p.add_run(text)
        _font(r, size=size, bold=bold, italic=italic)


def _set_run_only(p, text, *, size=BODY, bold=False, italic=False):
    p.text = ""
    r = p.add_run(text)
    _font(r, size=size, bold=bold, italic=italic)


def _no_borders(table):
    tbl = table._tbl
    tbl_pr = tbl.tblPr if tbl.tblPr is not None else OxmlElement("w:tblPr")
    if tbl.tblPr is None:
        tbl.insert(0, tbl_pr)
    borders = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        el = OxmlElement(f"w:{edge}")
        el.set(qn("w:val"), "nil")
        el.set(qn("w:sz"), "0")
        el.set(qn("w:space"), "0")
        el.set(qn("w:color"), "auto")
        borders.append(el)
    # remove existing
    for child in list(tbl_pr):
        if child.tag == qn("w:tblBorders"):
            tbl_pr.remove(child)
    tbl_pr.append(borders)


def _set_doc_defaults(doc: Document) -> None:
    style = doc.styles["Normal"]
    style.font.name = FONT
    style.font.size = Pt(BODY)
    style._element.rPr.rFonts.set(qn("w:ascii"), FONT)
    style._element.rPr.rFonts.set(qn("w:hAnsi"), FONT)
    style._element.rPr.rFonts.set(qn("w:cs"), FONT)
    style._element.rPr.rFonts.set(qn("w:eastAsia"), FONT)


def build() -> Path:
    doc = Document()
    _set_doc_defaults(doc)
    for section in doc.sections:
        section.top_margin = Cm(1.5)
        section.bottom_margin = Cm(1.5)
        section.left_margin = Cm(2.0)
        section.right_margin = Cm(2.0)
        section.page_width = Cm(21.0)
        section.page_height = Cm(29.7)

    # ===== Header: [gerb | ОБЩИНА…]  |  [Приложение / Вх. / Дата] =====
    outer = doc.add_table(rows=1, cols=2)
    outer.autofit = True
    _no_borders(outer)
    left, right = outer.rows[0].cells
    left.width = Cm(10.5)
    right.width = Cm(7.5)

    # Left: nested 2-col — gerb + municipality text (side by side, as on blank)
    inner = left.add_table(rows=1, cols=2)
    _no_borders(inner)
    logo_cell, muni_cell = inner.rows[0].cells
    logo_cell.width = Cm(1.8)
    muni_cell.width = Cm(8.5)

    if LOGO.is_file():
        lp = logo_cell.paragraphs[0]
        _pf(lp, after=0, before=0)
        run = lp.add_run()
        run.add_picture(str(LOGO), width=Cm(1.55))
    else:
        _set_run_only(logo_cell.paragraphs[0], "", size=BODY)

    mp = muni_cell.paragraphs[0]
    _pf(mp, after=0, before=2)
    _runs(mp, [("ОБЩИНА ТРОЯН", BODY, True, False)])
    mp2 = muni_cell.add_paragraph()
    _pf(mp2, after=0, before=2)
    _runs(mp2, [("№ .............................................", SMALL, False, False)])

    # Cell XML is [empty w:p…, nested tbl]. Drop leading empty paragraphs so gerb sits at the top.
    # OOXML still wants a trailing paragraph after the nested table.
    tc = left._tc
    for child in list(tc):
        if child.tag == qn("w:p"):
            tc.remove(child)
    trailing = OxmlElement("w:p")
    tc.append(trailing)

    # Right block
    rp = right.paragraphs[0]
    _pf(rp, after=0, before=0, align=WD_ALIGN_PARAGRAPH.RIGHT)
    _runs(rp, [("Приложение № 12", BODY, True, False)])
    r2 = right.add_paragraph()
    _pf(r2, after=0, before=0, align=WD_ALIGN_PARAGRAPH.RIGHT)
    _runs(r2, [("(ново, Решение № 965/17.09.2026 г.)", HINT, False, True)])
    r3 = right.add_paragraph()
    _pf(r3, after=0, before=6, align=WD_ALIGN_PARAGRAPH.RIGHT)
    _runs(r3, [("Вх. № .............................................", SMALL, False, False)])
    r4 = right.add_paragraph()
    _pf(r4, after=0, before=0, align=WD_ALIGN_PARAGRAPH.RIGHT)
    _runs(r4, [("Дата ...............................................", SMALL, False, False)])

    _p(doc, "", after=8)

    # ===== Title =====
    _p(doc, "ЗАЯВЛЕНИЕ", size=TITLE, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER, after=2)
    _p(
        doc,
        "ползване на спортни зали и помещения в",
        size=BODY,
        bold=True,
        align=WD_ALIGN_PARAGRAPH.CENTER,
        after=0,
    )
    _p(
        doc,
        "Многофункционална спортна зала „Троян“",
        size=BODY,
        bold=True,
        align=WD_ALIGN_PARAGRAPH.CENTER,
        after=10,
    )

    # ===== Applicant =====
    # Keep label formatting separate from value placeholder (own run) so fill preserves bold/normal.
    p = _p(doc, "", after=0)
    _runs(p, [("от ", BODY, False, False), ("{{ORG_NAME}}", BODY, False, False)])
    _p(
        doc,
        "(посочете трите имена за физическото лице или наименованието на юридическото лице)",
        size=HINT,
        italic=True,
        align=WD_ALIGN_PARAGRAPH.CENTER,
        after=6,
    )

    p = _p(doc, "", after=0)
    _runs(
        p,
        [
            ("ЕГН/ЕИК ", BODY, False, False),
            ("{{EIK}}", BODY, False, False),
            (
                ", постоянен/настоящ адрес или адрес на управление на юридическото лице: гр./с. ",
                BODY,
                False,
                False,
            ),
            ("{{CITY}}", BODY, False, False),
            (", община ", BODY, False, False),
            ("{{MUNICIPALITY}}", BODY, False, False),
            (", област ", BODY, False, False),
            ("{{OBLAST}}", BODY, False, False),
            (", ул. (ж.к.) ", BODY, False, False),
            ("{{STREET}}", BODY, False, False),
            (", тел.: ", BODY, False, False),
            ("{{PHONE}}", BODY, False, False),
            (" представляван/а от ", BODY, False, False),
            ("{{REP_NAME}}", BODY, False, False),
        ],
    )
    _p(
        doc,
        "(трите имена на упълномощен или законен представител на юридическото лице)",
        size=HINT,
        italic=True,
        align=WD_ALIGN_PARAGRAPH.CENTER,
        after=4,
    )
    p = _p(doc, "", after=8)
    _runs(p, [("e-mail: ", BODY, False, False), ("{{EMAIL}}", BODY, False, False)])

    _p(doc, "УВАЖАЕМА ГОСПОЖО КМЕТ,", size=BODY, bold=True, after=6)
    _p(
        doc,
        "Заявявам желание за предоставяне за ползване на следното помещение в Многофункционална спортна зала „Троян“",
        size=BODY,
        after=4,
    )
    p = _p(doc, "", after=6)
    _runs(
        p,
        [
            ("{{CHK_HALL_SPORT}}", BODY, False, False),
            (" Спортна зала;   ", BODY, False, False),
            ("{{CHK_HALL_TRAIN}}", BODY, False, False),
            (" Тренировъчна зала;  ", BODY, False, False),
            ("{{CHK_HALL_CONF}}", BODY, False, False),
            (" Конферентна зала (30 места)", BODY, False, False),
        ],
    )
    p = _p(doc, "", after=0)
    _runs(p, [("за провеждане на   ", BODY, False, False), ("{{EVENT_TITLE}}", BODY, False, False)])
    _p(
        doc,
        "(наименование на събитието)",
        size=HINT,
        italic=True,
        align=WD_ALIGN_PARAGRAPH.CENTER,
        after=4,
    )
    _p(doc, "вид на събитието", size=BODY, after=2)
    p = _p(doc, "", after=0)
    _runs(p, [("{{CHK_KIND_TRAIN}}", BODY, False, False), (" Тренировки;", BODY, False, False)])
    p = _p(doc, "", after=0)
    _runs(p, [("{{CHK_KIND_TOURN}}", BODY, False, False), (" Спортни турнири/състезания;", BODY, False, False)])
    p = _p(doc, "", after=6)
    _runs(
        p,
        [
            ("{{CHK_KIND_OTHER}}", BODY, False, False),
            (" Образователни, културни или социални събития и дейности;", BODY, False, False),
        ],
    )
    _p(doc, "дати и часове за ползване:", size=BODY, after=4)

    # Schedule table
    sched = doc.add_table(rows=11, cols=4)
    sched.style = "Table Grid"
    sched.alignment = WD_TABLE_ALIGNMENT.CENTER
    headers = [
        "Дата",
        "Начален час",
        "Краен час",
        "Целодневно ползване\n(до 8 часа в диапазона\n08:00 ч. – 22:00 ч.)",
    ]
    for i, h in enumerate(headers):
        cell = sched.rows[0].cells[i]
        cell.text = ""
        cp = cell.paragraphs[0]
        _pf(cp, after=0)
        r = cp.add_run(h)
        _font(r, size=HINT, bold=True)
    for ri in range(1, 11):
        for ci in range(4):
            cell = sched.rows[ri].cells[ci]
            cell.text = ""
            cp = cell.paragraphs[0]
            _pf(cp, after=0)
            r = cp.add_run("☐" if ci == 3 else "")
            _font(r, size=BODY)

    _p(doc, "", after=6)
    _p(doc, "За провеждането на събитието е необходимо:", size=BODY, after=4)
    p = _p(doc, "", after=6)
    _runs(
        p,
        [
            ("{{CHK_EQ_BASKET}}", SMALL, False, False),
            (" Оборудване и спортни съоръжения - Баскетбол;   ", SMALL, False, False),
            ("{{CHK_EQ_VOLLEY}}", SMALL, False, False),
            (" Оборудване и спортни съоръжения – Волейбол;   ", SMALL, False, False),
            ("{{CHK_EQ_TENNIS}}", SMALL, False, False),
            (" Оборудване и спортни съоръжения – Тенис;    ", SMALL, False, False),
            ("{{CHK_EQ_VINYL}}", SMALL, False, False),
            (" Монтиране на предпазна винилова настилка;   ", SMALL, False, False),
            ("{{CHK_EQ_SOUND}}", SMALL, False, False),
            (" Озвучителна система (оповестителна);   ", SMALL, False, False),
            ("{{CHK_EQ_SCREEN}}", SMALL, False, False),
            (" Лед екран, табла за резултати;", SMALL, False, False),
        ],
    )
    p = _p(doc, "", after=0)
    _runs(
        p,
        [
            ("Изисква се преустройство на залата:  ", BODY, False, False),
            ("{{CHK_REBUILD_YES}}", BODY, False, False),
            (" ДА;  ", BODY, False, False),
            ("{{CHK_REBUILD_NO}}", BODY, False, False),
            (" НЕ", BODY, False, False),
        ],
    )
    _p(
        doc,
        "(поставяне на предпазна винилова настилка, внасяне, монтаж и демонтаж на сцена, подиуми и сценично оборудване)",
        size=HINT,
        italic=True,
        after=6,
    )
    _p(doc, "Други бележки: ........................................................................", size=BODY, after=0)
    _p(doc, "........................................................................................", size=BODY, after=0)
    _p(doc, "........................................................................................", size=BODY, after=8)

    _p(
        doc,
        "Запознат/а съм, че съгласно Наредба № 7 за определянето и администрирането на местните такси и цени на услуги на територията на община Троян, цената на услуга с ДДС е:",
        size=SMALL,
        after=4,
    )

    def price_table(title: str, rows: list[tuple[str, str]]):
        _p(doc, title, size=BODY, bold=True, after=2)
        t = doc.add_table(rows=len(rows), cols=2)
        t.style = "Table Grid"
        for ri, (a, b) in enumerate(rows):
            for ci, val in enumerate((a, b)):
                cell = t.rows[ri].cells[ci]
                cell.text = ""
                cp = cell.paragraphs[0]
                _pf(cp, after=0)
                r = cp.add_run(val)
                _font(r, size=HINT, bold=(ri == 0))
        _p(doc, "", after=4)

    price_table(
        "За спортна зала:",
        [
            ("Наименование на услугата", "цена в евро"),
            (
                "1.1. Почасово ползване за тренировъчна дейност и провеждане на състезания и турнири от спортни клубове, регистрирани и осъществяващи дейност на територията на община Троян",
                "8,00 евро/час",
            ),
            (
                "1.2. Почасово ползване за тренировъчна дейност на външни спортни клубове и организации",
                "25,00 евро/час",
            ),
            ("1.3. Дневно ползване (до 8 часа в диапазона 08:00 ч. – 22:00 ч.)", ""),
            (
                "1.3.1. за турнири и спортни прояви с публика, организирани от външни клубове – 240,00 евро",
                "240 евро",
            ),
            ("1.3.2.  за събития с ниско натоварване", "240 евро"),
            ("1.3.3.  за събития със средно натоварване", "360 евро"),
            ("1.3.4.  за събития с високо натоварване", "480 евро"),
        ],
    )
    price_table(
        "За тренировъчна зала:",
        [
            ("Наименование на услугата", "цена в евро"),
            (
                "2.1. Почасово ползване за тренировъчна дейност и провеждане на състезания и турнири от спортни клубове, регистрирани и осъществяващи дейност на територията на община Троян",
                "5,00 евро/час",
            ),
            (
                "2.2. Почасово ползване за тренировъчна дейност и провеждане на състезания и турнири на външни спортни клубове и организации",
                "15,00 евро/час",
            ),
        ],
    )
    price_table(
        "За конферентна зала:",
        [
            ("Наименование на услугата", "цена в евро"),
            (
                "3.1. Почасово ползване на конферентна зала в Многофункционална спортна зала „Троян“",
                "15,00 евро/час",
            ),
        ],
    )

    _p(
        doc,
        "Дължимата сума се заплаща до 3 работни дни след получаване на Разрешение за ползване на:",
        size=SMALL,
        after=2,
    )
    _p(
        doc,
        "1. Касата на Община Троян – административна сграда на адрес Троян, пл. „Възраждане“ № 1",
        size=SMALL,
        after=0,
    )
    _p(doc, "2. С ПОС терминал в отдел „Услуги на гражданите“", size=SMALL, after=0)
    _p(doc, "3. По банков път на сметка:", size=SMALL, after=0)
    _p(doc, "IBAN: BG92UBBS81558420008108", size=SMALL, after=0)
    _p(doc, "BIC: UBBSBGSF", size=SMALL, after=0)
    _p(doc, "Банка: „Обединена Българска Банка“ АД", size=SMALL, after=6)
    _p(
        doc,
        "* Забележка: При невнасяне на дължимите такси в регламентирания срок, заявлението се счита оттеглено.",
        size=HINT,
        italic=True,
        after=12,
    )

    sig = doc.add_paragraph()
    _pf(sig, after=0)
    sig.paragraph_format.tab_stops.add_tab_stop(Cm(16), WD_TAB_ALIGNMENT.RIGHT)
    _runs(
        sig,
        [
            ("Дата: ", BODY, False, False),
            ("{{TODAY}}", BODY, False, False),
            (" г.", BODY, False, False),
            ("\t", BODY, False, False),
            ("С уважение: ..............................................", BODY, False, False),
        ],
    )
    sig2 = doc.add_paragraph()
    _pf(sig2, after=0, before=0)
    sig2.paragraph_format.tab_stops.add_tab_stop(Cm(16), WD_TAB_ALIGNMENT.RIGHT)
    _runs(
        sig2,
        [
            ("Град Троян", BODY, False, False),
            ("\t", BODY, False, False),
            ("(подпис)", HINT, False, False),
        ],
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    doc.save(OUT)
    return OUT


if __name__ == "__main__":
    path = build()
    print(f"Wrote {path} ({path.stat().st_size} bytes)")
