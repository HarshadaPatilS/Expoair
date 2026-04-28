with open('update_notebook.py', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('"execution_count": null', '"execution_count": None')

with open('update_notebook.py', 'w', encoding='utf-8') as f:
    f.write(content)
