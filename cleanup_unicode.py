from pathlib import Path
path = Path('web/app/(student)/practice/modules/page.tsx')
text = path.read_text(encoding='utf-8')
text = text.replace('\u00b7','-').replace('\u2014','-').replace('\u201c','"').replace('\u201d','"')
path.write_text(text, encoding='utf-8', newline='\n')
print('cleaned')
