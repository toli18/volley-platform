# BVF библиотека — преведено съдържание (еднократно)

Файловете `bvf_drills_bg.json` и `bvf_articles_bg.json` се генерират **веднъж**:

```bash
set BVF_LIBRARY_ROOT=C:\Users\krasi\Downloads\библиотека
python -m app.scripts.export_bvf_translations
```

След това се commit-ват в git. Платформата импортира само тях — без повторен превод.
